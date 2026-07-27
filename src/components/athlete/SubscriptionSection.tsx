// =============================================================================
// src/components/athlete/SubscriptionSection.tsx
// =============================================================================
// The athlete's subscription surface, mounted on the profile page.
//
// Two states, and the discriminator is the STATE of the row, never its mere
// existence: create-checkout-session writes an `incomplete` row before any
// payment and nobody cleans it up if the checkout is abandoned. The filtering
// lives in useAthleteSubscription; this component only renders what it gets.
//
//   - no vigent subscription → the coach's active plans + "Abbonati"
//   - vigent subscription    → state, renewal date, "Gestisci abbonamento"
//
// Both buttons hand off to the existing edge functions with their contracts
// untouched ({plan_id, athlete_id} -> {url} and {} -> {url}) and then leave the
// SPA: the Stripe pages are a full navigation, and coming back re-boots the app.
//
// Visual language follows the sibling sections of AthleteProfile (Aura tokens,
// glass surface), not the `.theme-athlete` variables — those are scoped to the
// intake flow.
// =============================================================================

import { useMutation } from "@tanstack/react-query";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useAthleteCoachPlans,
  useAthleteSubscription,
  type BillingPlan,
} from "@/hooks/useBillingPlans";
import { cn } from "@/lib/utils";
import { log } from "@/lib/logger";

/** Amounts are stored in cents. Every cadence of the closed domain gets an
 * explicit branch — the old `/mese` catch-all was the same silent-fallback
 * defect the cadence map removed server-side. An unknown value shows the bare
 * price rather than a wrong cadence. */
function formatPrice(plan: BillingPlan): string {
  const amount = (plan.price_amount ?? 0) / 100;
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: (plan.currency || "eur").toUpperCase(),
  }).format(amount);
  if (plan.billing_interval === "block") return `${formatted}/4 settimane`;
  if (plan.billing_interval === "month") return `${formatted}/mese`;
  if (plan.billing_interval === "year") return `${formatted}/anno`;
  if (plan.billing_interval === "one_time") return `${formatted} una tantum`;
  return formatted;
}

/**
 * Renders a date only when there really is one. current_period_end is nullable and
 * is genuinely NULL in the likeliest cases — a one-off plan, or the window between
 * the return from Stripe and the webhook — where `new Date(null)` would cheerfully
 * print 1/1/1970 as if it were a fact.
 */
function formatPeriodEnd(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

const SECTION_CLASSES = cn(
  "rounded-3xl p-6",
  "bg-white/70 backdrop-blur-xl",
  "border border-[#c0c7d0]/30",
  "flex flex-col gap-4",
);

const PRIMARY_BUTTON_CLASSES = cn(
  "w-full flex items-center justify-center gap-2",
  "py-3 px-5 rounded-full",
  "bg-brand-container text-white",
  "font-sans text-sm font-semibold",
  "active:scale-[0.98] transition-transform duration-200",
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
);

const SECONDARY_BUTTON_CLASSES = cn(
  "w-full flex items-center justify-center gap-2",
  "py-3 px-5 rounded-full",
  "bg-white/60 border border-[#c0c7d0]/40",
  "text-on-surface font-sans text-sm font-semibold",
  "active:scale-[0.98] transition-transform duration-200",
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
);

function SectionHeader() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="h-10 w-10 shrink-0 rounded-2xl bg-brand-container/10 flex items-center justify-center"
      >
        <CreditCard className="h-5 w-5 text-brand-container" strokeWidth={1.75} />
      </span>
      <h2 className="font-display text-base font-semibold text-on-surface">Abbonamento</h2>
    </div>
  );
}

export default function SubscriptionSection() {
  const { user, profile, loading: authLoading } = useAuth();
  const subscriptionQuery = useAthleteSubscription();
  const plansQuery = useAthleteCoachPlans();

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      if (!user) throw new Error("Non autenticato");
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { plan_id: planId, athlete_id: user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Risposta senza URL di pagamento");
      return data.url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => {
      log.error("[SubscriptionSection] checkout failed", err);
      toast.error("Non riesco ad aprire il pagamento", { description: "Riprova fra poco." });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Risposta senza URL del portale");
      return data.url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => {
      log.error("[SubscriptionSection] portal failed", err);
      toast.error("Non riesco ad aprire la gestione abbonamento", {
        description: "Riprova fra poco.",
      });
    },
  });

  // Hooks are all above this line (law 6): from here on it is rendering only.
  // isLoading, NOT isPending: in TanStack v5 isPending means "no data yet", which
  // stays true FOREVER for a disabled query. useAthleteCoachPlans is disabled when
  // the athlete has no coach, so isPending would pin this section on the loading
  // copy permanently. isLoading is `isPending && isFetching`, i.e. a real fetch.
  // The auth clauses cover the window before `profile` lands, when coach_id is not
  // known yet and the plans query has legitimately not started.
  const isLoading =
    authLoading || (!!user && !profile) || subscriptionQuery.isLoading || plansQuery.isLoading;
  const subscription = subscriptionQuery.data ?? null;
  const plans = plansQuery.data ?? [];
  const periodEnd = formatPeriodEnd(subscription?.current_period_end);

  if (isLoading) {
    return (
      <section aria-label="Abbonamento" className={SECTION_CLASSES}>
        <SectionHeader />
        <p className="text-sm text-on-surface-variant">Carico il tuo abbonamento…</p>
      </section>
    );
  }

  if (subscription) {
    const status = subscription.status;
    const stateLabel =
      status === "past_due"
        ? "Pagamento non riuscito"
        : status === "canceling"
          ? "Attivo fino alla scadenza"
          : "Attivo";
    const stateDetail =
      status === "past_due"
        ? "Aggiorna il metodo di pagamento per non perdere l'accesso."
        : status === "canceling"
          ? periodEnd
            ? `Si conclude il ${periodEnd}.`
            : "Non si rinnoverà alla scadenza."
          : periodEnd
            ? `Si rinnova il ${periodEnd}.`
            : "Rinnovo in fase di attivazione.";

    return (
      <section aria-label="Abbonamento" className={SECTION_CLASSES}>
        <SectionHeader />

        <div className="flex flex-col gap-1">
          <p className="font-display text-lg font-semibold text-on-surface">
            {subscription.billing_plans?.name ?? "Il tuo piano"}
          </p>
          <p
            className={cn(
              "text-sm font-semibold",
              status === "past_due" ? "text-destructive" : "text-brand-container",
            )}
          >
            {stateLabel}
          </p>
          <p className="text-sm text-on-surface-variant">{stateDetail}</p>
        </div>

        <button
          type="button"
          onClick={() => portalMutation.mutate()}
          disabled={portalMutation.isPending}
          className={SECONDARY_BUTTON_CLASSES}
        >
          {portalMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          )}
          Gestisci abbonamento
        </button>
      </section>
    );
  }

  if (plans.length === 0) {
    return (
      <section aria-label="Abbonamento" className={SECTION_CLASSES}>
        <SectionHeader />
        <p className="text-sm text-on-surface-variant">
          Non ci sono piani disponibili al momento. Scrivi al tuo coach per attivare un abbonamento.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Abbonamento" className={SECTION_CLASSES}>
      <SectionHeader />
      <p className="text-sm text-on-surface-variant">
        Attiva un abbonamento per sbloccare tutte le funzioni del tuo percorso.
      </p>

      <ul className="flex flex-col gap-3">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="rounded-2xl border border-[#c0c7d0]/30 bg-white/60 p-4 flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <p className="font-display text-base font-semibold text-on-surface">{plan.name}</p>
              <p className="font-display text-sm font-bold text-brand-container tabular-nums">
                {formatPrice(plan)}
              </p>
              {plan.description ? (
                <p className="text-sm text-on-surface-variant">{plan.description}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => checkoutMutation.mutate(plan.id)}
              disabled={checkoutMutation.isPending}
              className={PRIMARY_BUTTON_CLASSES}
            >
              {checkoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
              ) : null}
              Abbonati
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
