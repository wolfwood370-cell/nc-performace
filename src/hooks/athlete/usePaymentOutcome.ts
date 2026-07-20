// =============================================================================
// src/hooks/athlete/usePaymentOutcome.ts
// =============================================================================
// Handles the return trip from Stripe Checkout, which lands on an athlete page
// carrying `?payment=success` or `?payment=cancelled`.
//
// Three jobs, in this order:
//   1. strip the parameter immediately, so a refresh or a back-navigation does
//      not replay the toast;
//   2. tell the athlete what happened, in plain language;
//   3. on success, wait for the webhook and then refresh what the app knows.
//
// Why step 3 is a poll and not a single invalidation: the redirect from Stripe
// and the webhook delivery are independent, so the athlete usually arrives BEFORE
// the subscription has been recorded. And the flags that decide whether paid
// features appear (tier, subscription_status) live on `profile`, which useAuth
// keeps in local component state and only ever fills from onAuthStateChange —
// there is no refetch to call. Refreshing the session is what makes that listener
// fire, so the profile is re-read everywhere without a full page reload.
// The poll gives up quietly: the next navigation or reload will pick the state up
// anyway, and a failure toast here would be noise on a payment that did succeed.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hasActiveAccess } from "@/lib/billing/access";
import { log } from "@/lib/logger";

/** Backoff for the webhook race. Roughly 14s of total patience. */
const POLL_DELAYS_MS = [1500, 3000, 4500, 5000];

export function usePaymentOutcome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Announced once per arrival, never once per re-render: searchParams is a new
  // object on every render and would otherwise re-trigger the effect.
  const announcedRef = useRef(false);
  // Kept in state, not read back from the URL: the parameter is stripped
  // immediately, so by the time `user` is available the URL no longer says why.
  const [awaitingActivation, setAwaitingActivation] = useState(false);

  const outcome = searchParams.get("payment");

  // Effect 1 — announce and clean up. Deliberately WITHOUT a cleanup function:
  // stripping the parameter changes searchParams, which re-runs this effect, and a
  // cleanup here would tear down whatever it had just started (announcedRef makes
  // the second run a no-op).
  useEffect(() => {
    if (!outcome || announcedRef.current) return;
    announcedRef.current = true;

    const next = new URLSearchParams(searchParams);
    next.delete("payment");
    setSearchParams(next, { replace: true });

    if (outcome === "cancelled") {
      toast.message("Pagamento annullato", {
        description: "Nessun addebito è stato effettuato.",
      });
      return;
    }
    if (outcome !== "success") return;

    toast.success("Pagamento riuscito", {
      description: "Stiamo attivando il tuo abbonamento…",
    });
    setAwaitingActivation(true);
  }, [outcome, searchParams, setSearchParams]);

  // Effect 2 — wait for the webhook. Separate from effect 1 because `user` starts
  // out null: useAuth is not a context, so every caller gets its own state that
  // fills in asynchronously. Polling from effect 1 would consume the one-shot guard
  // while `user` was still null and the wait would never happen at all.
  // Deps are stable values only, so the cleanup fires on unmount, not on a URL edit.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!awaitingActivation || !userId) return;

    let abandoned = false;

    const waitForActivation = async () => {
      for (const delay of POLL_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (abandoned) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("coaching_mode, subscription_status")
          .eq("id", userId as string)
          .maybeSingle();
        if (abandoned) return;
        if (error) {
          log.error("[usePaymentOutcome] profile poll failed", error);
          continue;
        }
        if (!hasActiveAccess(data)) continue;

        // Closed BEFORE refreshing: refreshSession() fires onAuthStateChange, which
        // hands useAuth a new user object. Leaving the flag up would re-enter this
        // effect, poll again, refresh again — a loop with no exit.
        setAwaitingActivation(false);
        // Recorded: push it into every consumer. refreshSession() re-fires
        // onAuthStateChange, which is the only path that refills useAuth's profile.
        await queryClient.invalidateQueries({ queryKey: ["athlete-subscription"] });
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          log.error("[usePaymentOutcome] session refresh failed", refreshError);
        }
        return;
      }
      setAwaitingActivation(false);
      log.warn("[usePaymentOutcome] abbonamento non ancora attivo al termine dell'attesa");
    };

    void waitForActivation();

    return () => {
      abandoned = true;
    };
  }, [awaitingActivation, userId, queryClient]);
}
