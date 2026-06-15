// =============================================================================
// src/components/auth/ProtectedCoachRoute.tsx
// =============================================================================
// Auth + role gate for the Coach Platform routes. Mirror of
// ProtectedAthleteRoute ("one guard component per role").
//
// Decision tree (top to bottom — first match wins):
//   1. loading          → render <LoadingSpinner /> (don't flicker the UI)
//   2. !user            → redirect to /auth
//   3. !profile         → spinner (profile lands ~1 frame after user)
//   4. role !== "coach" → redirect athletes to /athlete (they ARE logged in,
//                         just on the wrong surface — never to /auth)
//   5. otherwise        → render children
//
// Composed OUTSIDE SubscriptionGuard in App.tsx: this gate answers "can you
// see any coach surface at all"; SubscriptionGuard then answers "is your
// subscription in good standing". RLS already protects the data — this is
// defense-in-depth at the routing layer (audit D10).
// =============================================================================

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface ProtectedCoachRouteProps {
  children: ReactNode;
}

export function ProtectedCoachRoute({ children }: ProtectedCoachRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  if (!profile) {
    return <LoadingSpinner />;
  }
  if (profile.role !== "coach") {
    return <Navigate to="/athlete" replace />;
  }

  return <>{children}</>;
}
