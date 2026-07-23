// =============================================================================
// src/pages/Attiva.tsx
// =============================================================================
// Landing of every auth action link: the invite ("attiva il tuo account") and
// the recurring passwordless sign-in both come back here. NO password step —
// that is the whole point of the slice.
//
// Thin on purpose: all the reading and deciding lives in the pure
// `@/lib/auth/authCallback` (vitest runs in node env, a component here would
// not be testable). This file only wires browser state to those functions.
// =============================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { MetaHead } from "@/components/MetaHead";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { describeActivation, parseAuthCallback } from "@/lib/auth/authCallback";
import { resolveHomePath } from "@/lib/auth/resolveHomePath";

/** Same delay as ResetPassword: time for auth-js to consume the URL. */
const SETTLE_DELAY_MS = 600;

export default function Attiva() {
  const navigate = useNavigate();

  // Snapshot at the FIRST render. auth-js processes the URL asynchronously and
  // CLEARS the fragment on success, while this page is lazy-loaded: reading
  // window.location later is a race we would lose silently.
  const [params] = useState(() => parseAuthCallback(window.location.hash, window.location.search));
  const [hasSession, setHasSession] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      setHasSession(true);
      setSettled(true);
    });

    // PKCE shape. Unreachable today — the client runs the implicit flow — but
    // cheap insurance if `flowType` ever changes. Failures fall through to the
    // getSession check below rather than throwing at the user.
    const exchange =
      params.code && !params.error
        ? supabase.auth.exchangeCodeForSession(params.code).catch(() => undefined)
        : Promise.resolve(undefined);

    const timer = window.setTimeout(async () => {
      await exchange;
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) setHasSession(true);
      setSettled(true);
    }, SETTLE_DELAY_MS);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [params]);

  const state = describeActivation({ params, hasSession, settled });

  // Every hook runs before any early return (legge #6).
  useEffect(() => {
    if (state !== "ready") return;
    let active = true;
    resolveHomePath().then((path) => {
      if (active) navigate(path, { replace: true });
    });
    return () => {
      active = false;
    };
  }, [state, navigate]);

  if (state === "pending" || state === "ready") {
    return (
      <>
        <MetaHead title="Accesso in corso" description="Stiamo attivando il tuo accesso." />
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <LoadingSpinner />
        </div>
      </>
    );
  }

  const copy =
    state === "expired"
      ? {
          title: "Questo link non è più valido",
          description:
            "I link di accesso valgono una sola volta e scadono dopo poco. Richiedine uno nuovo: ti arriva subito via email.",
        }
      : state === "denied"
        ? {
            title: "Accesso non completato",
            description:
              "Non siamo riusciti a completare l'accesso con questo link. Richiedine uno nuovo e riprova.",
          }
        : {
            title: "Link non valido",
            description:
              "Questa pagina si apre dal link che ricevi via email. Richiedine uno per entrare.",
          };

  return (
    <>
      <MetaHead title="Accesso" description="Attiva il tuo accesso a NC Performance Hub." />
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline" onClick={() => navigate("/auth")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Richiedi un nuovo accesso
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
