import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export interface BillingPlan {
  id: string;
  coach_id: string;
  name: string;
  price_amount: number; // cents
  currency: string;
  /** Closed domain (CHECK billing_plans_interval_domain): the form writes only
   * 'block' | 'one_time'; 'month' | 'year' stay representable on archived rows
   * sold at those cadences. */
  billing_interval: string;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  active: boolean;
  description: string | null;
  created_at: string;
  /** Canonical entitlement key (billing_plans.tier). */
  tier: "monthly" | "premium";
  /** Who the plan is sold to. create-checkout-session refuses a mismatched
   * athlete with a 403 — this field is the coherence key, not a label. */
  coaching_mode: "coached" | "autonomous";
  /** Duration in 4-week blocks for prepaid plans; NULL for renewal plans,
   * where Stripe dictates the period. */
  duration_blocks: number | null;
  /** GENERATED column (duration_blocks * 28), read-only: Postgres rejects any
   * write that includes it. */
  term_days: number | null;
}

interface AthleteSubscriptionRow {
  id: string;
  athlete_id: string;
  plan_id: string;
  status: "active" | "past_due" | "canceled" | "incomplete" | "canceling";
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

/** The row states that mean "this athlete currently has a subscription to show".
 * `incomplete` is deliberately out: create-checkout-session writes such a row
 * BEFORE any payment and nobody deletes it when the checkout is abandoned, so
 * treating it as a subscription would show a phantom one to an athlete who never
 * paid. `canceled` is out too — they should be offered the plans again. */
const VIGENT_SUBSCRIPTION_STATUSES = ["active", "canceling", "past_due"] as const;

export function useBillingPlans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const plansQuery = useQuery({
    queryKey: ["billing-plans", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("billing_plans")
        .select("*")
        .eq("coach_id", user.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BillingPlan[];
    },
    enabled: !!user,
  });

  const createPlanMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      price_amount: number;
      billing_interval: "block" | "one_time";
      tier: "monthly" | "premium";
      coaching_mode: "coached" | "autonomous";
      duration_blocks: number | null;
      description?: string;
    }) => {
      if (!user) throw new Error("Non autenticato");
      const { data, error } = await supabase
        .from("billing_plans")
        .insert({
          coach_id: user.id,
          name: payload.name,
          price_amount: payload.price_amount,
          billing_interval: payload.billing_interval,
          tier: payload.tier,
          coaching_mode: payload.coaching_mode,
          duration_blocks: payload.duration_blocks,
          description: payload.description || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-plans"] });
      toast({ title: "Piano creato", description: "Il nuovo piano è stato aggiunto." });
    },
    onError: (e) => {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from("billing_plans")
        .update({ active: false })
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-plans"] });
      toast({ title: "Piano archiviato" });
    },
  });

  // Generate checkout link
  const checkoutMutation = useMutation({
    mutationFn: async ({ planId, athleteId }: { planId: string; athleteId: string }) => {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { plan_id: planId, athlete_id: athleteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { url: string };
    },
    onError: (e) => {
      toast({ title: "Errore checkout", description: e.message, variant: "destructive" });
    },
  });

  return {
    plans: plansQuery.data ?? [],
    isLoadingPlans: plansQuery.isLoading,
    createPlan: createPlanMutation.mutate,
    isCreatingPlan: createPlanMutation.isPending,
    deletePlan: deletePlanMutation.mutate,
    generateCheckout: checkoutMutation.mutateAsync,
    isGeneratingCheckout: checkoutMutation.isPending,
  };
}

/**
 * The athlete's own subscription, as the athlete app shows it. Filtered by state
 * rather than just "the newest row": an abandoned checkout leaves an `incomplete`
 * row behind, and being the most recent it would otherwise win and be rendered as
 * a real subscription. Own-row RLS keeps this to the caller's own subscriptions.
 */
export function useAthleteSubscription() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["athlete-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("athlete_subscriptions")
        .select("*, billing_plans(*)")
        .eq("athlete_id", user.id)
        .in("status", [...VIGENT_SUBSCRIPTION_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0] ?? null;
      return row as (AthleteSubscriptionRow & { billing_plans: BillingPlan }) | null;
    },
    enabled: !!user,
  });
}

/**
 * The plans the athlete can actually subscribe to: the ACTIVE ones published by
 * their own coach. Mirrors the "Athletes can view coach plans" RLS policy, which
 * joins on profiles.coach_id — an athlete without a coach legitimately sees none,
 * and the caller renders an empty state for that.
 */
export function useAthleteCoachPlans() {
  const { user, profile } = useAuth();
  const coachId = profile?.coach_id ?? null;

  return useQuery({
    queryKey: ["athlete-coach-plans", coachId],
    queryFn: async () => {
      if (!coachId) return [];
      const { data, error } = await supabase
        .from("billing_plans")
        .select("*")
        .eq("coach_id", coachId)
        .eq("active", true)
        .order("price_amount", { ascending: true });
      if (error) throw error;
      return data as BillingPlan[];
    },
    enabled: !!user && !!coachId,
  });
}
