/**
 * src/pages/coach/CoachCheckinInbox.tsx
 * ---------------------------------------------------------------------------
 * Inbox / Triage Center — Aura Health System.
 *
 * High-fidelity split-pane layout:
 *
 *   ┌──────────────────────┬──────────────────────────────────────┐
 *   │  Feed list           │  Workspace (selected checkin)        │
 *   │  ────────────────    │  ────────────────────────────────    │
 *   │  · pill filter tabs  │  · sticky header (avatar + status)   │
 *   │  · scrollable cards  │  · scrollable subjective + metrics   │
 *   │                      │  · sticky Coach Action Box (CTAs)    │
 *   └──────────────────────┴──────────────────────────────────────┘
 *
 * Card types in the feed:
 *   1. Attention — soft warning tint when the week's READING asks for the
 *      coach's eye: adherence under the gate, or sessions the watchdog
 *      flagged. Never a verdict on the average RPE (checkinReading.ts).
 *   2. Standard Weekly Check-in — neutral Aura card.
 *   3. Sent / skipped — success / muted tone.
 *
 * State management:
 *   - useWeeklyCheckins → checkins + mutations (live data preserved 1:1).
 *   - local `filter` for the 4 pill tabs.
 *   - local `selectedId` for the active row in the right panel.
 *     Auto-selects the first matching checkin when the feed changes.
 *   - local `draftNotes` per checkin id (in-memory edit buffer; saved
 *     via updateCheckin on blur / explicit save).
 *
 * Layout rules (DESIGN.md Aura):
 *   - Cards: rounded-3xl bg-surface-container-lowest border outline-variant/20
 *     shadow-[0_8px_30px_rgb(0,0,0,0.04)]
 *   - Pills: rounded-full transitions for filters and CTAs
 *   - Independent scroll tracks (overflow-y-auto on both columns)
 *   - Sticky header + sticky bottom action box on the workspace side
 *   - h-[calc(100vh-2rem)] full-screen split
 */
import { useEffect, useMemo, useState } from "react";

import { CoachLayout } from "@/components/coach/CoachLayout";
import { MetaHead } from "@/components/MetaHead";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useWeeklyCheckins, type WeeklyCheckin } from "@/hooks/useWeeklyCheckins";
import {
  overThresholdText,
  readingSourceFromSnapshot,
  weekReading,
  type WeekReading,
} from "../../../supabase/functions/_shared/program/checkinReading.ts";

import {
  Zap,
  Send,
  X,
  Loader2,
  Clock,
  Inbox,
  Archive,
  AlertTriangle,
  TrendingUp,
  Dumbbell,
  Target,
  Flame,
  CheckCircle2,
  SkipForward,
  ShieldAlert,
  Activity,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Filter model
// ---------------------------------------------------------------------------
type FilterKey = "all" | "review" | "anomalies" | "archived";

const FILTERS: Array<{ key: FilterKey; label: string; icon: LucideIcon }> = [
  { key: "all", label: "Tutti", icon: Inbox },
  { key: "review", label: "Da Revisionare", icon: Clock },
  { key: "anomalies", label: "Anomalie", icon: ShieldAlert },
  { key: "archived", label: "Archiviati", icon: Archive },
];

/** The reading of the week, derived from the persisted snapshot by the SAME
 *  pure module the edge used to write it: this page reads, it never
 *  re-judges (no threshold lives here). No snapshot → no reading: a missing
 *  week is not an anomaly. Rows older than the watchdog count carry no key:
 *  the flagged-sessions line is simply not shown for them. */
function readingOf(c: WeeklyCheckin): WeekReading | null {
  const m = c.metrics_snapshot;
  if (!m) return null;
  return weekReading(readingSourceFromSnapshot(m), m.sessions_over_threshold ?? 0);
}

/** «Anomalie» = the reading asks for attention: adherence under the gate, or
 *  at least one session over the watchdog's threshold. */
function needsAttention(c: WeeklyCheckin): boolean {
  return readingOf(c)?.attention === true;
}

/** First letter up, for a reading sentence rendered on its own row. */
const ucFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function filterCheckins(list: WeeklyCheckin[], key: FilterKey): WeeklyCheckin[] {
  switch (key) {
    case "review":
      return list.filter((c) => c.status === "pending");
    case "anomalies":
      return list.filter(needsAttention);
    case "archived":
      return list.filter((c) => c.status === "sent" || c.status === "skipped");
    case "all":
    default:
      return list;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function initialsOf(name?: string | null): string {
  if (!name) return "??";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??"
  );
}

function formatWeek(weekStart: string): string {
  return new Date(weekStart).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

interface CardTone {
  kind: "attention" | "sent" | "skipped" | "pending";
  // Surface bg + border for the feed row + side accent strip.
  bg: string;
  border: string;
  accent: string;
  iconBg: string;
  iconText: string;
  pillBg: string;
  pillText: string;
  badge: { icon: LucideIcon; label: string };
}

/**
 * Map a checkin → visual tone for the feed card.
 *
 * - Attention (reading.attention): soft warning tint — attention, not risk
 * - Pending standard: neutral Aura card
 * - Sent / approved: success tint
 * - Skipped: muted tone
 */
function toneOf(c: WeeklyCheckin): CardTone {
  if (needsAttention(c)) {
    return {
      kind: "attention",
      bg: "bg-warning/5",
      border: "border-warning/30",
      accent: "bg-warning",
      iconBg: "bg-warning/15",
      iconText: "text-warning",
      pillBg: "bg-warning/10",
      pillText: "text-warning",
      badge: { icon: AlertTriangle, label: "Attenzione" },
    };
  }
  if (c.status === "sent" || c.status === "approved") {
    return {
      kind: "sent",
      bg: "bg-surface-container-lowest",
      border: "border-success/30",
      accent: "bg-success",
      iconBg: "bg-success/15",
      iconText: "text-success",
      pillBg: "bg-success/10",
      pillText: "text-success",
      badge: { icon: CheckCircle2, label: "Inviato" },
    };
  }
  if (c.status === "skipped") {
    return {
      kind: "skipped",
      bg: "bg-surface-container-low",
      border: "border-outline-variant/30",
      accent: "bg-outline-variant",
      iconBg: "bg-muted",
      iconText: "text-muted-foreground",
      pillBg: "bg-muted",
      pillText: "text-muted-foreground",
      badge: { icon: SkipForward, label: "Scartato" },
    };
  }
  return {
    kind: "pending",
    bg: "bg-surface-container-lowest",
    border: "border-outline-variant/20",
    accent: "bg-primary",
    iconBg: "bg-primary-container/15",
    iconText: "text-primary",
    pillBg: "bg-primary-container/10",
    pillText: "text-primary",
    badge: { icon: Inbox, label: "Da rivedere" },
  };
}

// ===========================================================================
// Page
// ===========================================================================
export default function CoachCheckinInbox() {
  const { checkins, isLoading, generateCheckins, updateCheckin, approveAndSend } =
    useWeeklyCheckins();

  const [filter, setFilter] = useState<FilterKey>("review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Per-checkin in-memory edit buffer keyed by id. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Derived: filtered list + active checkin
  const visible = useMemo(() => filterCheckins(checkins, filter), [checkins, filter]);
  const selected = useMemo(
    () => checkins.find((c) => c.id === selectedId) ?? null,
    [checkins, selectedId],
  );

  // Auto-select the first row in the active filter when the previous
  // selection becomes invisible (e.g. after switching tab or after a
  // mutation removes the row from the current bucket).
  useEffect(() => {
    if (visible.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((c) => c.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  // Counts for the pill badges
  const counts = useMemo(
    () => ({
      all: checkins.length,
      review: checkins.filter((c) => c.status === "pending").length,
      anomalies: checkins.filter(needsAttention).length,
      archived: checkins.filter((c) => c.status === "sent" || c.status === "skipped").length,
    }),
    [checkins],
  );

  // ── Handlers ───────────────────────────────────────────────────────────
  const setDraft = (id: string, text: string) => {
    setDrafts((prev) => ({ ...prev, [id]: text }));
  };

  const persistDraft = (id: string) => {
    const text = drafts[id];
    if (text == null) return;
    updateCheckin.mutate({ id, updates: { coach_notes: text } });
  };

  const handleApprove = (c: WeeklyCheckin) => {
    const draftText = drafts[c.id] ?? c.coach_notes ?? c.ai_summary ?? "";
    approveAndSend.mutate({ ...c, coach_notes: draftText });
  };

  const handleSkip = (c: WeeklyCheckin) => {
    updateCheckin.mutate({ id: c.id, updates: { status: "skipped" } });
  };

  return (
    <>
      <MetaHead
        title="Inbox & Triage"
        description="Centro di triage per i check-in settimanali degli atleti."
      />
      <CoachLayout title="Inbox & Triage" subtitle="Revisione e triage settimanale">
        <div
          className={cn(
            // Full-screen split: subtract the page header padding (~2rem)
            // from viewport height so both columns scroll independently.
            "flex h-[calc(100vh-2rem)] overflow-hidden gap-6",
          )}
        >
          {/* ═══ LEFT COLUMN — Feed list ═══ */}
          <aside
            className={cn(
              "w-full max-w-[420px] flex flex-col",
              "rounded-3xl bg-surface-container-lowest border border-outline-variant/20",
              "shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden",
            )}
          >
            {/* Sticky header */}
            <header className="px-5 pt-5 pb-3 border-b border-outline-variant/10 flex-shrink-0">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h1 className="font-display text-headline-md text-on-surface tracking-tight">
                    Triage Center
                  </h1>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {visible.length} {visible.length === 1 ? "evento" : "eventi"}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => generateCheckins.mutate()}
                  disabled={generateCheckins.isPending}
                  className="gap-1.5 flex-shrink-0"
                >
                  {generateCheckins.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Analizza
                </Button>
              </div>

              {/* Pill filter tabs */}
              <nav className="flex flex-wrap gap-2" aria-label="Filtri triage">
                {FILTERS.map((f) => {
                  const isActive = filter === f.key;
                  const count = counts[f.key];
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold transition-all duration-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isActive
                          ? "bg-primary-container text-white shadow-[0_2px_8px_rgb(0_62_98_/_0.20)]"
                          : "bg-surface-container-low text-on-surface-variant hover:bg-primary-container/10 hover:text-on-surface",
                      )}
                    >
                      <f.icon className="h-3.5 w-3.5" />
                      {f.label}
                      {count > 0 && (
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-3xs font-bold tabular-nums",
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-primary-container/15 text-primary",
                          )}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </header>

            {/* Scrollable feed */}
            <ScrollArea className="flex-1 custom-scrollbar">
              <div className="px-3 py-4 space-y-2">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => <FeedSkeleton key={i} />)
                ) : visible.length === 0 ? (
                  <FeedEmpty filter={filter} />
                ) : (
                  visible.map((c) => (
                    <FeedCard
                      key={c.id}
                      checkin={c}
                      isSelected={c.id === selectedId}
                      onSelect={() => setSelectedId(c.id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </aside>

          {/* ═══ RIGHT COLUMN — Workspace ═══ */}
          <main
            className={cn(
              "flex-1 flex flex-col min-w-0",
              "rounded-3xl bg-surface-container-lowest border border-outline-variant/20",
              "shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden",
            )}
          >
            {selected ? (
              <Workspace
                key={selected.id}
                checkin={selected}
                draft={drafts[selected.id] ?? selected.coach_notes ?? selected.ai_summary ?? ""}
                onDraftChange={(text) => setDraft(selected.id, text)}
                onDraftBlur={() => persistDraft(selected.id)}
                onApprove={() => handleApprove(selected)}
                onSkip={() => handleSkip(selected)}
                isSending={approveAndSend.isPending}
                isUpdating={updateCheckin.isPending}
              />
            ) : (
              <WorkspaceEmpty />
            )}
          </main>
        </div>
      </CoachLayout>
    </>
  );
}

// ===========================================================================
// Left column — Feed components
// ===========================================================================
function FeedCard({
  checkin,
  isSelected,
  onSelect,
}: {
  checkin: WeeklyCheckin;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const tone = toneOf(checkin);
  const BadgeIcon = tone.badge.icon;
  const initials = initialsOf(checkin.athlete?.full_name);
  const compliance = checkin.metrics_snapshot?.compliance_pct;
  const rpe = checkin.metrics_snapshot?.avg_rpe;
  const reading = readingOf(checkin);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "relative w-full text-left rounded-2xl border p-4 transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tone.bg,
        tone.border,
        isSelected
          ? "ring-2 ring-primary shadow-[0_4px_14px_rgb(0_62_98_/_0.10)]"
          : "hover:shadow-[0_4px_14px_rgb(0,0,0,0.04)]",
      )}
    >
      {/* Side accent strip */}
      <div
        className={cn("absolute left-0 top-4 bottom-4 w-1 rounded-r-full", tone.accent)}
        aria-hidden
      />

      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11 flex-shrink-0">
          <AvatarImage src={checkin.athlete?.avatar_url || undefined} />
          <AvatarFallback className={cn("text-xs font-semibold", tone.iconBg, tone.iconText)}>
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-label-md font-bold text-on-surface truncate">
              {checkin.athlete?.full_name ?? "Atleta"}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold flex-shrink-0",
                tone.pillBg,
                tone.pillText,
              )}
            >
              <BadgeIcon className="h-2.5 w-2.5" />
              {tone.badge.label}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Settimana del {formatWeek(checkin.week_start)}
          </p>

          {/* Mini metric row — only when data is available */}
          {checkin.metrics_snapshot && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {typeof compliance === "number" && (
                <MiniStat
                  icon={Target}
                  value={`${compliance}%`}
                  highlight={reading?.adherence.gate === "below"}
                />
              )}
              {rpe && rpe !== "N/A" && <MiniStat icon={Flame} value={`RPE ${rpe}`} />}
              {checkin.metrics_snapshot.workouts_completed !== undefined && (
                <MiniStat
                  icon={Activity}
                  value={
                    // A missing denominator stays missing: "—", never "N/0".
                    typeof checkin.metrics_snapshot.workouts_scheduled === "number"
                      ? `${checkin.metrics_snapshot.workouts_completed}/${checkin.metrics_snapshot.workouts_scheduled}`
                      : "—"
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function MiniStat({
  icon: Icon,
  value,
  highlight,
}: {
  icon: LucideIcon;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold tabular-nums",
        highlight
          ? "bg-warning/10 text-warning"
          : "bg-surface-container-low text-on-surface-variant",
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {value}
    </span>
  );
}

function FeedSkeleton() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedEmpty({ filter }: { filter: FilterKey }) {
  const copy: Record<FilterKey, { title: string; subtitle: string }> = {
    all: {
      title: "Nessun check-in",
      subtitle: "Genera la prima analisi settimanale per popolare il triage.",
    },
    review: {
      title: "Nessun report da rivedere",
      subtitle: "Tutti i report sono stati elaborati. Bel lavoro!",
    },
    anomalies: {
      title: "Nessuna anomalia",
      subtitle: "Tutti gli atleti sono in zona ottimale.",
    },
    archived: {
      title: "Archivio vuoto",
      subtitle: "I report inviati e scartati appariranno qui.",
    },
  };
  const c = copy[filter];
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="h-12 w-12 rounded-full bg-primary-container/10 flex items-center justify-center mb-3">
        <Inbox className="h-6 w-6 text-primary" />
      </div>
      <p className="text-label-md font-bold text-on-surface">{c.title}</p>
      <p className="text-xs text-on-surface-variant mt-1 max-w-[260px]">{c.subtitle}</p>
    </div>
  );
}

// ===========================================================================
// Right column — Workspace
// ===========================================================================
function Workspace({
  checkin,
  draft,
  onDraftChange,
  onDraftBlur,
  onApprove,
  onSkip,
  isSending,
  isUpdating,
}: {
  checkin: WeeklyCheckin;
  draft: string;
  onDraftChange: (text: string) => void;
  onDraftBlur: () => void;
  onApprove: () => void;
  onSkip: () => void;
  isSending: boolean;
  isUpdating: boolean;
}) {
  const tone = toneOf(checkin);
  const BadgeIcon = tone.badge.icon;
  const initials = initialsOf(checkin.athlete?.full_name);
  const m = checkin.metrics_snapshot;
  const reading = readingOf(checkin);
  const isPending = checkin.status === "pending";

  return (
    <>
      {/* ── Sticky header ── */}
      <header
        className={cn(
          "flex items-center justify-between gap-4 px-6 py-5 border-b border-outline-variant/10 flex-shrink-0",
          tone.kind === "attention" && "bg-warning/5",
        )}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Avatar className="h-14 w-14 border-2 border-outline-variant/20 flex-shrink-0">
            <AvatarImage src={checkin.athlete?.avatar_url || undefined} />
            <AvatarFallback className={cn("text-base font-bold", tone.iconBg, tone.iconText)}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-display text-headline-md text-on-surface tracking-tight truncate">
              {checkin.athlete?.full_name ?? "Atleta"}
            </h2>
            <p className="text-sm text-on-surface-variant">
              Report settimana del {formatWeek(checkin.week_start)}
            </p>
          </div>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-label-md font-bold flex-shrink-0",
            tone.pillBg,
            tone.pillText,
          )}
        >
          <BadgeIcon className="h-3.5 w-3.5" />
          {tone.badge.label}
        </span>
      </header>

      {/* ── Scrollable body ── */}
      <ScrollArea className="flex-1 custom-scrollbar">
        <div className="px-6 py-6 space-y-6">
          {/* Reading of the week: facts in the method's order (adherence,
              sessions the watchdog flagged, load). No recommended action —
              the move stays with the coach. Warning tint = attention. */}
          {reading && (
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4",
                reading.attention
                  ? "border-warning/30 bg-warning/5"
                  : "border-outline-variant/20 bg-surface-container-low",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0",
                  reading.attention ? "bg-warning/15" : "bg-primary-container/10",
                )}
              >
                {reading.attention ? (
                  <AlertTriangle className="h-5 w-5 text-warning" strokeWidth={1.75} />
                ) : (
                  <Activity className="h-5 w-5 text-primary" strokeWidth={1.75} />
                )}
              </div>
              <div>
                <p
                  className={cn(
                    "text-label-md font-bold",
                    reading.attention ? "text-warning" : "text-on-surface",
                  )}
                >
                  Lettura della settimana
                </p>
                <ul className="text-sm text-on-surface-variant mt-0.5 leading-relaxed">
                  <li>{ucFirst(reading.adherence.text)}</li>
                  {reading.overThresholdSessions > 0 && (
                    <li>{overThresholdText(reading.overThresholdSessions)}</li>
                  )}
                  <li>{ucFirst(reading.load.text)}</li>
                </ul>
              </div>
            </div>
          )}

          {/* Subjective feedback (Spoto Press / coach notes) */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h3 className="font-display text-label-md font-bold text-on-surface uppercase tracking-wider">
                Feedback Soggettivo
              </h3>
            </div>
            {isPending ? (
              <Textarea
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onBlur={onDraftBlur}
                className="min-h-[140px] text-sm resize-none rounded-2xl"
                placeholder="Annota la sensazione soggettiva sull'esecuzione (es. Spoto Press eseguito con buon controllo eccentrico, nessun dolore segnalato)..."
              />
            ) : (
              <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-4 text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                {checkin.coach_notes ||
                  checkin.ai_summary ||
                  "Nessun feedback registrato per questa settimana."}
              </div>
            )}
          </section>

          {/* Objective metrics grid */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-display text-label-md font-bold text-on-surface uppercase tracking-wider">
                Metriche Oggettive
              </h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                icon={Target}
                label="Compliance"
                value={typeof m?.compliance_pct === "number" ? `${m.compliance_pct}%` : "—"}
                tone={reading?.adherence.gate === "below" ? "attention" : "default"}
              />
              <MetricCard
                icon={Activity}
                label="Sessioni"
                value={
                  // Same rule as the feed card: no fabricated denominator.
                  m?.workouts_completed !== undefined && typeof m?.workouts_scheduled === "number"
                    ? `${m.workouts_completed}/${m.workouts_scheduled}`
                    : "—"
                }
              />
              <MetricCard
                icon={Dumbbell}
                label="Volume"
                value={m?.total_volume !== undefined ? `${m.total_volume} UA` : "—"}
              />
              <MetricCard
                icon={Flame}
                label="RPE medio"
                // A number, read as a number: the average RPE gets no tint
                // (a mean of four short sessions is not a load, C-14).
                value={m?.avg_rpe && m.avg_rpe !== "N/A" ? `${m.avg_rpe}/10` : "—"}
              />
            </div>
          </section>
        </div>
      </ScrollArea>

      {/* ── Sticky Coach Action Box ── */}
      <footer
        className={cn(
          "flex-shrink-0 border-t border-outline-variant/20 px-6 py-4 bg-surface-container-low",
          "flex items-center gap-3",
        )}
      >
        {isPending ? (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={onSkip}
              disabled={isSending || isUpdating}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Scarta
            </Button>
            <div className="flex-1" />
            <Button
              size="lg"
              onClick={onApprove}
              disabled={isSending || isUpdating}
              className="gap-2 min-w-[200px]"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Approva &amp; Invia
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-on-surface-variant">
              {checkin.status === "sent"
                ? `Report inviato il ${new Date(checkin.updated_at).toLocaleDateString("it-IT")}.`
                : checkin.status === "skipped"
                  ? "Questo report è stato scartato."
                  : "Report approvato — in attesa di invio."}
            </p>
            <div className="flex-1" />
            <Button variant="outline" size="lg" disabled className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Archiviato
            </Button>
          </>
        )}
      </footer>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "default" | "attention";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "attention"
          ? "bg-warning/5 border-warning/30"
          : "bg-surface-container-low border-outline-variant/20",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "attention" ? "text-warning" : "text-on-surface-variant",
          )}
        />
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "font-display text-2xl font-bold tabular-nums",
          tone === "attention" ? "text-warning" : "text-on-surface",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function WorkspaceEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-6 py-12">
      <div className="h-16 w-16 rounded-3xl bg-primary-container/10 flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-primary" strokeWidth={1.75} />
      </div>
      <h3 className="font-display text-headline-md text-on-surface tracking-tight">
        Seleziona un report
      </h3>
      <p className="text-sm text-on-surface-variant mt-2 max-w-md">
        Scegli una voce dal feed di sinistra per visualizzare il dettaglio dell'atleta e approvare
        l'invio del report settimanale.
      </p>
    </div>
  );
}
