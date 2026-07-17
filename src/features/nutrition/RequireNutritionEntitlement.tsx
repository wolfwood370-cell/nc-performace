// =============================================================================
// src/features/nutrition/RequireNutritionEntitlement.tsx
// Route guard for /athlete/nutrition. Commercial/UX barrier ONLY, with a
// silent redirect (no upsell copy — decision Nick 2026-07-17): the DATA
// defense is the own-row RLS on nutrition_releases. Composes INSIDE
// ProtectedAthleteRoute (auth/role/onboarding guaranteed by the parent).
// Fail-closed: no tier, missing entitlement row or query error ⇒ redirect.
// =============================================================================

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useNutritionEntitlement } from "./useNutritionEntitlement";

export function RequireNutritionEntitlement({ children }: { children: ReactNode }) {
  const { entitled, isLoading } = useNutritionEntitlement();

  if (isLoading) {
    return <LoadingSpinner />;
  }
  if (!entitled) {
    return <Navigate to="/athlete" replace />;
  }
  return <>{children}</>;
}
