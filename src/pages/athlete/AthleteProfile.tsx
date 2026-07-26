// =============================================================================
// src/pages/athlete/AthleteProfile.tsx
// =============================================================================
// Athlete profile page — clean, mobile-first, glassmorphic.
//
// Data sources:
//   - useAuth().profile  → full_name, avatar_url
//   - useAuth().user     → email
//   - useAuth().signOut  → existing centralised sign-out (handles localStorage,
//                          IndexedDB cleanup, and the hard reload to /auth)
//
// The action rows ("Impostazioni Account", "Notifiche", "Contatta il Coach")
// are scaffold-only — they fire a friendly toast for now. They render as
// proper <button>s so screen readers and keyboard users get the right
// affordance from day one; the real screens will be wired up in follow-up
// commits.
//
// Logout is the only fully-wired action. It calls signOut() directly; the
// hook itself navigates to /auth via window.location.href after cleanup,
// which means no client-side <Navigate> is needed here — but we still catch
// errors and surface them via toast so a failed sign-out doesn't leave the
// user staring at a dead button.
// =============================================================================

import { useState } from "react";
import {
  Bell,
  ChevronRight,
  LogOut,
  MessageCircle,
  Settings,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import SubscriptionSection from "@/components/athlete/SubscriptionSection";
import { useAuth } from "@/hooks/useAuth";
import { usePaymentOutcome } from "@/hooks/athlete/usePaymentOutcome";
import { cn } from "@/lib/utils";
import { log } from "@/lib/logger";

// -----------------------------------------------------------------------------
// Action row definition. id is used only for keys + the "coming soon" toast
// copy; label is the user-facing string.
// -----------------------------------------------------------------------------
interface ActionRow {
  id: "account" | "notifications" | "contact-coach";
  label: string;
  icon: LucideIcon;
}

const ACTION_ROWS: ActionRow[] = [
  { id: "account", label: "Impostazioni Account", icon: Settings },
  { id: "notifications", label: "Notifiche", icon: Bell },
  { id: "contact-coach", label: "Contatta il Coach", icon: MessageCircle },
];

export default function AthleteProfile() {
  const { user, profile, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Stripe's cancel_url lands here with ?payment=cancelled.
  usePaymentOutcome();

  const displayName = profile?.full_name?.trim() || "Atleta";
  const email = user?.email ?? "";
  const avatarUrl = profile?.avatar_url ?? null;

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // signOut performs its own redirect to /auth via window.location.href
      // after clearing localStorage + IndexedDB, so we never need to navigate
      // manually here.
      await signOut();
    } catch (err) {
      log.error("[AthleteProfile] signOut failed", err);
      toast.error("Logout non riuscito. Riprova.");
      setIsLoggingOut(false);
    }
  };

  const handleActionClick = (row: ActionRow) => {
    toast.message("In arrivo", {
      description: `"${row.label}" sarà disponibile a breve.`,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------------------------------------------
         Page header
         --------------------------------------------------------------- */}
      <header className="pt-2 pb-1">
        <span className="font-display text-xs font-semibold tracking-widest uppercase text-brand-container">
          Profilo
        </span>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-on-surface">
          Il tuo profilo
        </h1>
      </header>

      {/* ---------------------------------------------------------------
         Identity card — large avatar + name + email
         --------------------------------------------------------------- */}
      <section
        aria-label="Identità atleta"
        className={cn(
          "relative overflow-hidden",
          "rounded-3xl p-6",
          "bg-white/70 backdrop-blur-xl",
          "border border-[#c0c7d0]/30",
          "flex flex-col items-center gap-4",
        )}
      >
        {/* Ambient brand glow — decorative */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -left-12 w-40 h-40 bg-brand-container/15 rounded-full blur-[50px]"
        />

        {/* Avatar — image if present, else generic UserIcon. The ring around
            it is decorative; we keep it thin to match the "clinical" tone. */}
        <div
          className={cn(
            "z-10 relative",
            "h-24 w-24 rounded-full overflow-hidden",
            "bg-surface-container border border-[#c0c7d0]/50",
            "ring-4 ring-brand-container/10",
            "flex items-center justify-center",
          )}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`Avatar di ${displayName}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserIcon
              className="h-10 w-10 text-brand-container"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="z-10 flex flex-col items-center text-center">
          <p className="font-display text-xl font-bold tracking-tight text-on-surface">
            {displayName}
          </p>
          {email ? <p className="mt-1 text-sm text-on-surface-variant break-all">{email}</p> : null}
        </div>
      </section>

      {/* ---------------------------------------------------------------
         Subscription — plans + checkout, or state + Customer Portal.
         Hidden ONLY for explicitly coached athletes (billed off-platform,
         they never buy for themselves). A null/unknown coaching_mode still
         SEES it: a useless section is cheaper than a customer who cannot pay.
         --------------------------------------------------------------- */}
      {profile?.coaching_mode !== "coached" && <SubscriptionSection />}

      {/* ---------------------------------------------------------------
         Settings / actions list — single glass card, internal dividers
         --------------------------------------------------------------- */}
      <section
        aria-label="Impostazioni e azioni"
        className={cn(
          "rounded-3xl overflow-hidden",
          "bg-white/70 backdrop-blur-xl",
          "border border-[#c0c7d0]/30",
        )}
      >
        <ul role="list" className="divide-y divide-[#c0c7d0]/30">
          {ACTION_ROWS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => handleActionClick({ id, label, icon: Icon })}
                className={cn(
                  "w-full flex items-center gap-4",
                  "px-5 py-4 text-left",
                  "transition-colors active:bg-brand-container/5",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-10 w-10 shrink-0 rounded-2xl",
                    "bg-brand-container/10",
                    "flex items-center justify-center",
                  )}
                >
                  <Icon className="h-5 w-5 text-brand-container" strokeWidth={1.75} />
                </span>
                <span className="flex-1 font-display text-base font-semibold text-on-surface">
                  {label}
                </span>
                <ChevronRight
                  className="h-5 w-5 text-on-surface-variant shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------
         Logout — destructive action, visually de-emphasised from the
         brand pill so it doesn't compete with positive CTAs elsewhere.
         --------------------------------------------------------------- */}
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className={cn(
          "w-full",
          "flex items-center justify-center gap-2",
          "py-4 px-6 rounded-full",
          "bg-white/60 backdrop-blur-xl",
          "border border-destructive/30",
          "text-destructive font-display text-base font-semibold",
          "active:scale-[0.98] transition-transform duration-200",
          "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
        )}
      >
        <LogOut className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        {isLoggingOut ? "Disconnessione in corso..." : "Logout"}
      </button>
    </div>
  );
}
