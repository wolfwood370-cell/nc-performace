/**
 * src/pages/coach/CoachAthletes.tsx
 * ---------------------------------------------------------------------------
 * Coach roster — Aura Health System desktop/iPad pattern.
 *
 * Page layout:
 *   1. Canvas tint (bg-background = Aura surface #f5faff) inherits from
 *      CoachLayout, blends with the sticky left sidebar.
 *   2. Top Control Panel:
 *      - Headline title (font-extrabold, text-[28px]) + count badge
 *      - Search input rounded-xl with #c1c7d0 outline transitioning to
 *        primary (#005685) + ambient outer glow on focus
 *      - 5 filter pills rounded-full (Tutti / Attivi / In Onboarding /
 *        Rehab Limitati / Sospesi) + pill «Archiviati» visibile solo se
 *        esiste almeno un atleta archiviato
 *   3. Responsive grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
 *
 * Data binding:
 *   - useAthletesRiskOverview → allAthletes (acwr, readiness, riskLevel,
 *     riskFlags, etc.)
 *   - Live-session subscription preserved (workout_logs realtime channel)
 *   - Auth guard preserved
 *
 * Filter logic:
 *   activeFilter ∈ "all" | "active" | "onboarding" | "rehab" | "suspended" | "archived"
 *   Gli archiviati (criterio unico isArchived, calcolato nel hook) NON
 *   entrano nei bucket attivi: vivono solo nella vista «Archiviati».
 *   - all       → tutti i NON archiviati
 *   - active    → readiness entro 3 giorni (existing isActive heuristic)
 *   - onboarding → mai check-in (readinessDate === null)
 *   - rehab     → riskLevel high|moderate
 *   - suspended → ultima readiness > 14 giorni fa
 *   - archived  → settings.archived === true; azione «Ripristina» via RPC
 *
 * AthleteCard mapping:
 *   - acwrValue: trigger State Critical quando ACWR > 1.5
 *   - readinessScore: già 0-100 dal hook rischio (conversione unica in readinessMath) — passthrough
 *   - painMarkers: riskFlags selezionati per type === "pain_reported" (mai per label)
 *   - missingOnboardingSteps: ["Primo check-in"] quando nessun check-in esiste → State C
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CoachLayout } from "@/components/coach/CoachLayout";
import { MetaHead } from "@/components/MetaHead";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InviteAthleteDialog } from "@/components/coach/InviteAthleteDialog";
import { AthleteCard } from "@/components/coach/AthleteCard";

import { useAthletesRiskOverview, type AthleteRiskData } from "@/hooks/useAthletesRiskOverview";
import { selectPainMarkers } from "@/lib/painMarkers";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { ArchiveRestore, Users, UserPlus, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Filter model
// ---------------------------------------------------------------------------
type FilterKey = "all" | "active" | "onboarding" | "rehab" | "suspended" | "archived";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Tutti" },
  { key: "active", label: "Attivi" },
  { key: "onboarding", label: "In Onboarding" },
  { key: "rehab", label: "Rehab / Limitati" },
  { key: "suspended", label: "Sospesi" },
];

// Appended to FILTERS only while at least one athlete is archived.
const ARCHIVED_FILTER: { key: FilterKey; label: string } = {
  key: "archived",
  label: "Archiviati",
};

// ---------------------------------------------------------------------------
// Time-window helpers
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

function isWithinDays(date: string | null, days: number): boolean {
  if (!date) return false;
  return Date.now() - new Date(date).getTime() < days * DAY_MS;
}

function isOlderThanDays(date: string | null, days: number): boolean {
  if (!date) return false;
  return Date.now() - new Date(date).getTime() > days * DAY_MS;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CoachAthletes() {
  const { user, loading: authLoading } = useAuth();
  const { allAthletes, isLoading } = useAthletesRiskOverview();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  // ── Live-session subscription (preserved) ───────────────────────────────
  const queryClient = useQueryClient();
  const { data: liveAthleteIds = [] } = useQuery({
    queryKey: ["live-sessions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const athleteIds = allAthletes.map((a) => a.athleteId);
      if (athleteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workout_logs")
        .select("athlete_id")
        .in("athlete_id", athleteIds)
        .eq("status", "scheduled")
        .not("started_at", "is", null);
      if (error) return [];
      return [...new Set((data ?? []).map((d) => d.athlete_id))];
    },
    enabled: !!user && allAthletes.length > 0,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user) return;

    const channelName = "live-sessions-realtime";

    // Defensive: remove any stale channel with this topic before re-subscribing.
    // See useCoachAlerts.ts for full rationale (HMR / singleton client race).
    supabase
      .getChannels()
      .filter((c) => c.topic === `realtime:${channelName}`)
      .forEach((c) => {
        supabase.removeChannel(c);
      });

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "workout_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["live-sessions", user.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // ── Per-filter buckets (computed once, used both for counts and list) ───
  const buckets = useMemo(() => {
    // Archived athletes (single isArchived criterion, applied in the hook)
    // never enter the active buckets: they only live in the archived view.
    const all = allAthletes.filter((a) => !a.archived);
    const archived = allAthletes.filter((a) => a.archived);
    const onboarding = all.filter((a) => a.readinessDate === null && a.latestReadiness === null);
    const active = all.filter((a) => isWithinDays(a.readinessDate, 3));
    const rehab = all.filter((a) => a.riskLevel === "high" || a.riskLevel === "moderate");
    const suspended = all.filter((a) => isOlderThanDays(a.readinessDate, 14));
    return { all, active, onboarding, rehab, suspended, archived };
  }, [allAthletes]);

  // Apply active filter + search query
  const visible = useMemo(() => {
    const list = buckets[activeFilter];
    const q = searchQuery.trim().toLowerCase();
    return q ? list.filter((a) => a.athleteName.toLowerCase().includes(q)) : list;
  }, [buckets, activeFilter, searchQuery]);

  // Leave the archived view when it empties: its pill disappears with it.
  useEffect(() => {
    if (activeFilter === "archived" && buckets.archived.length === 0) {
      setActiveFilter("all");
    }
  }, [activeFilter, buckets.archived.length]);

  // Restore an archived athlete — write goes through the guarded RPC only
  // (never a client-side .update on profiles.settings). No confirm dialog:
  // restoring is non-destructive by design (declared in the plan).
  const unarchiveMutation = useMutation({
    mutationFn: async (athleteId: string) => {
      const { error } = await supabase.rpc("unarchive_athlete", {
        p_athlete_id: athleteId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, athleteId) => {
      toast.success("Atleta ripristinato");
      queryClient.invalidateQueries({ queryKey: ["risk-overview-athletes"] });
      queryClient.invalidateQueries({ queryKey: ["coach-athletes"] });
      queryClient.invalidateQueries({ queryKey: ["athlete-profile", athleteId] });
    },
    onError: (error: Error) => {
      toast.error(`Errore nel ripristino: ${error.message}`);
    },
  });

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (authLoading || isLoading) {
    return (
      <CoachLayout title="Atleti" subtitle="Caricamento roster…">
        <RosterSkeleton />
      </CoachLayout>
    );
  }

  // ── Empty (no athletes at all) ──────────────────────────────────────────
  if (allAthletes.length === 0) {
    return (
      <>
        <MetaHead title="Atleti" description="Roster del coach." />
        <CoachLayout title="Atleti" subtitle="Inizia con il tuo primo atleta">
          <RosterEmpty />
        </CoachLayout>
      </>
    );
  }

  // ── Roster view ─────────────────────────────────────────────────────────
  return (
    <>
      <MetaHead title="Atleti" description="Roster del coach." />
      <CoachLayout title="Atleti" subtitle="Roster e gestione clienti">
        <div className="space-y-6 animate-fade-in">
          {/* ═══ Top Control Panel ═══ */}
          <header className="space-y-5">
            {/* Title row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <h1 className="font-display font-extrabold text-[28px] leading-tight tracking-tight text-on-surface">
                  Atleti
                </h1>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-container/15 text-primary px-3 py-1 text-sm font-bold tabular-nums"
                  aria-label={`${buckets.all.length} atleti monitorati`}
                >
                  <Users className="h-3.5 w-3.5" />
                  {buckets.all.length}
                </span>
              </div>

              <InviteAthleteDialog
                trigger={
                  <Button className="gap-2 self-start sm:self-auto">
                    <UserPlus className="h-4 w-4" />
                    Invita atleta
                  </Button>
                }
              />
            </div>

            {/* Search + filter pills row */}
            <div className="flex flex-col gap-4">
              {/* Search field */}
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca atleti per nome…"
                  aria-label="Cerca atleti"
                  className={cn(
                    "w-full h-11 pl-10 pr-10 rounded-xl bg-surface-container-lowest",
                    "border border-outline-variant text-sm text-on-surface placeholder:text-on-surface-variant/70",
                    "transition-[box-shadow,border-color] duration-200",
                    "focus:outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgb(0_86_133_/_0.12)]",
                  )}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Pulisci ricerca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <nav className="flex flex-wrap gap-2" aria-label="Filtri roster">
                {[...FILTERS, ...(buckets.archived.length > 0 ? [ARCHIVED_FILTER] : [])].map(
                  (f) => {
                    const isActive = activeFilter === f.key;
                    const count = buckets[f.key].length;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setActiveFilter(f.key)}
                        aria-pressed={isActive}
                        className={cn(
                          "inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-bold transition-all duration-200",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                          isActive
                            ? "bg-primary-container text-white shadow-[0_4px_14px_rgb(0_62_98_/_0.20)]"
                            : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40 hover:bg-primary-container/10 hover:text-on-surface",
                        )}
                      >
                        {f.label}
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-3xs font-bold tabular-nums",
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-primary-container/15 text-primary",
                          )}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  },
                )}
              </nav>
            </div>
          </header>

          {/* ═══ Responsive Grid ═══ */}
          {visible.length === 0 ? (
            <FilterEmpty filter={activeFilter} searchQuery={searchQuery} />
          ) : activeFilter === "archived" ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              role="list"
              aria-label="Atleti archiviati"
            >
              {visible.map((athlete) => (
                <div key={athlete.athleteId} role="listitem">
                  <ArchivedAthleteCard
                    athlete={athlete}
                    onRestore={() => unarchiveMutation.mutate(athlete.athleteId)}
                    restoring={
                      unarchiveMutation.isPending &&
                      unarchiveMutation.variables === athlete.athleteId
                    }
                    disabled={unarchiveMutation.isPending}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              role="list"
              aria-label="Elenco atleti"
            >
              {visible.map((athlete) => {
                const isLive = liveAthleteIds.includes(athlete.athleteId);
                // latestReadiness is ALREADY 0-100: the risk hook converts
                // 1-10 subjective values through subjectiveReadinessToScore
                // (the single conversion point). Pass through, never rescale.
                const readinessScore =
                  typeof athlete.latestReadiness === "number" ? athlete.latestReadiness : undefined;
                // Pain markers — selected by flag TYPE (stable identifier),
                // never by the displayed label text (see selectPainMarkers).
                const painMarkers = selectPainMarkers(athlete.riskFlags);
                // Onboarding — the ONLY thing this condition measures is
                // "no check-in ever recorded", so the pending stepper names
                // exactly that step. No invented step list ("PAR-Q", …):
                // per-athlete step detection does not exist yet.
                const missingOnboardingSteps =
                  activeFilter === "onboarding" ||
                  (athlete.readinessDate === null && athlete.latestReadiness === null)
                    ? ["Primo check-in"]
                    : undefined;
                return (
                  <div key={athlete.athleteId} role="listitem">
                    <AthleteCard
                      athleteId={athlete.athleteId}
                      athleteName={isLive ? `🔴 ${athlete.athleteName}` : athlete.athleteName}
                      avatarUrl={athlete.avatarUrl}
                      avatarInitials={athlete.avatarInitials}
                      lastCheckinDate={athlete.readinessDate}
                      programName={null}
                      isActive={isWithinDays(athlete.readinessDate, 3)}
                      acwr={athlete.acwr}
                      readinessScore={readinessScore}
                      painMarkers={painMarkers.length > 0 ? painMarkers : undefined}
                      missingOnboardingSteps={missingOnboardingSteps}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CoachLayout>
    </>
  );
}

// ===========================================================================
// Skeleton + Empty states
// ===========================================================================
function RosterSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-11 w-full max-w-md rounded-xl" />
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

function RosterEmpty() {
  return (
    <Card className="p-12 text-center max-w-2xl mx-auto">
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-container to-primary mb-6 ring-4 ring-primary/10">
        <Users className="h-10 w-10 text-white" strokeWidth={1.75} />
      </div>
      <h3 className="font-display text-2xl font-bold text-on-surface mb-2 tracking-tight">
        Nessun atleta ancora
      </h3>
      <p className="text-base text-on-surface-variant max-w-md mx-auto mb-6 leading-relaxed">
        Invita i tuoi atleti per iniziare a monitorare carico, readiness e performance in tempo
        reale.
      </p>
      <InviteAthleteDialog
        trigger={
          <Button size="lg" className="gap-2">
            <UserPlus className="h-5 w-5" />
            Invita il primo atleta
          </Button>
        }
      />
    </Card>
  );
}

function ArchivedAthleteCard({
  athlete,
  onRestore,
  restoring,
  disabled,
}: {
  athlete: AthleteRiskData;
  onRestore: () => void;
  /** True only for the card whose restore is in flight (label swap). */
  restoring: boolean;
  /** True while ANY restore is in flight: the shared mutation only tracks
   *  the last mutate(), so per-card pending would lie mid-flight. One
   *  restore at a time keeps the state truthful. */
  disabled: boolean;
}) {
  const navigate = useNavigate();
  const archivedOn = athlete.archivedAt
    ? new Date(athlete.archivedAt).toLocaleDateString("it-IT")
    : null;
  return (
    <Card className="p-5 flex items-center gap-4 rounded-3xl">
      <Avatar className="h-12 w-12">
        <AvatarImage src={athlete.avatarUrl ?? undefined} alt={athlete.athleteName} />
        <AvatarFallback>{athlete.avatarInitials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => navigate(`/coach/athlete/${athlete.athleteId}`)}
          className="block max-w-full truncate text-left font-bold text-on-surface hover:text-primary transition-colors"
        >
          {athlete.athleteName}
        </button>
        <p className="text-sm text-on-surface-variant">
          {archivedOn ? `Archiviato il ${archivedOn}` : "Archiviato"}
        </p>
      </div>
      <Button variant="outline" className="shrink-0 gap-2" onClick={onRestore} disabled={disabled}>
        <ArchiveRestore className="h-4 w-4" />
        {restoring ? "Ripristino…" : "Ripristina"}
      </Button>
    </Card>
  );
}

function FilterEmpty({ filter, searchQuery }: { filter: FilterKey; searchQuery: string }) {
  if (searchQuery) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-on-surface-variant">
          Nessun atleta trovato per <span className="font-bold">&ldquo;{searchQuery}&rdquo;</span>.
        </p>
      </Card>
    );
  }
  const copy: Record<FilterKey, { title: string; subtitle: string; icon: LucideIcon }> = {
    all: { title: "Nessun atleta", subtitle: "Invita il tuo primo atleta.", icon: Users },
    active: {
      title: "Nessun atleta attivo",
      subtitle: "Nessuno ha registrato readiness negli ultimi 3 giorni.",
      icon: Users,
    },
    onboarding: {
      title: "Nessuno in onboarding",
      subtitle: "Tutti gli atleti hanno completato il primo check-in.",
      icon: Users,
    },
    rehab: {
      title: "Nessun atleta in Rehab / Limitato",
      subtitle: "Nessun atleta con dolore dichiarato o recupero basso.",
      icon: Users,
    },
    suspended: {
      title: "Nessun atleta sospeso",
      subtitle: "Tutti gli atleti hanno fatto check-in negli ultimi 14 giorni.",
      icon: Users,
    },
    archived: {
      title: "Nessun atleta archiviato",
      subtitle: "Gli atleti archiviati compaiono qui e possono essere ripristinati.",
      icon: Users,
    },
  };
  const c = copy[filter];
  const Icon = c.icon;
  return (
    <Card className="p-12 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-container/10 mb-3">
        <Icon className="h-7 w-7 text-primary" strokeWidth={1.75} />
      </div>
      <h3 className="font-display text-lg font-bold text-on-surface mb-1">{c.title}</h3>
      <p className="text-sm text-on-surface-variant max-w-sm mx-auto">{c.subtitle}</p>
    </Card>
  );
}
