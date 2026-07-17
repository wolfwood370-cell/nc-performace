import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SunThemeSync } from "@/components/logic/SunThemeSync";
import { OfflineSyncProvider } from "@/providers/OfflineSyncProvider";
import { InstallPrompt } from "@/components/mobile/InstallPrompt";
import { NetworkBadge } from "@/components/ui/NetworkBadge";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SubscriptionGuard } from "@/components/auth/SubscriptionGuard";
import { ProtectedCoachRoute } from "@/components/auth/ProtectedCoachRoute";
import { ProtectedAthleteRoute } from "@/components/auth/ProtectedAthleteRoute";
import { RequireNutritionEntitlement } from "@/features/nutrition/RequireNutritionEntitlement";
import { SwUpdatePrompt } from "@/components/pwa/SwUpdatePrompt";
import { CelebrationOverlay } from "@/components/celebration/Confetti";

// Lazy-loaded pages
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CoachHome = lazy(() => import("./pages/coach/CoachHome"));
const CoachAthletes = lazy(() => import("./pages/coach/CoachAthletes"));
const AthleteDetail = lazy(() => import("./pages/coach/AthleteDetail"));
const CoachCalendar = lazy(() => import("./pages/coach/CoachCalendar"));
const CoachMessages = lazy(() => import("./pages/coach/CoachMessages"));
const CoachAnalytics = lazy(() => import("./pages/coach/CoachAnalytics"));
const CoachSettings = lazy(() => import("./pages/coach/CoachSettings"));
const CoachBusiness = lazy(() => import("./pages/coach/CoachBusiness"));
const ProgramBuilder = lazy(() => import("./pages/coach/ProgramBuilder"));
const CoachLibrary = lazy(() => import("./pages/coach/CoachLibrary"));
const ExerciseDatabase = lazy(() => import("./pages/coach/ExerciseDatabase"));
const CoachCheckinInbox = lazy(() => import("./pages/coach/CoachCheckinInbox"));
const FmsScreening = lazy(() => import("./pages/coach/FmsScreening"));
const KnowledgeBase = lazy(() => import("./pages/coach/KnowledgeBase"));
const MasterCopilot = lazy(() => import("./pages/coach/MasterCopilot"));
const IntakeForm = lazy(() => import("./features/intake/IntakeForm"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService"));

// Athlete App — Training + Readiness + Nutrizione (entitlement-gated).
const AthleteLayout = lazy(() => import("./components/athlete/AthleteLayout"));
const AthleteDashboard = lazy(() => import("./pages/athlete/AthleteDashboard"));
const AthleteTraining = lazy(() => import("./pages/athlete/AthleteTraining"));
const AthleteProfile = lazy(() => import("./pages/athlete/AthleteProfile"));
const DailyCheckin = lazy(() => import("./pages/athlete/DailyCheckin"));
const AthleteReadinessDetails = lazy(() => import("./pages/athlete/AthleteReadinessDetails"));
const WeeklyCheckin = lazy(() => import("./pages/athlete/WeeklyCheckin"));
const WorkoutPhaseDetail = lazy(() => import("./pages/athlete/WorkoutPhaseDetail"));
const ExercisePreview = lazy(() => import("./pages/athlete/ExercisePreview"));
const ActiveWorkout = lazy(() => import("./pages/athlete/ActiveWorkout"));
const PostWorkoutDebrief = lazy(() => import("./pages/athlete/PostWorkoutDebrief"));
const TrainingAnalytics = lazy(() => import("./pages/athlete/TrainingAnalytics"));
const AcwrAnalysis = lazy(() => import("./pages/athlete/AcwrAnalysis"));
const DailyReadiness = lazy(() => import("./pages/athlete/DailyReadiness"));
const AthleteNutrition = lazy(() => import("./features/nutrition/AthleteNutrition"));

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light">
    <OfflineSyncProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NetworkBadge />
        <InstallPrompt />
        <SwUpdatePrompt />
        <CelebrationOverlay />

        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Root path: redirect to the auth gate (login/signup).
                  Any deep link (`/auth?token=XYZ`) is preserved by routing
                  directly to /auth; this redirect only catches bare `/`. */}
              <Route path="/" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Coach Routes — wrapped in SubscriptionGuard */}
              <Route
                path="/coach"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachHome />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/athletes"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachAthletes />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/athlete/:id"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <AthleteDetail />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/programs"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <ProgramBuilder />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/calendar"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachCalendar />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/messages"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachMessages />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/library"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachLibrary />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/exercises"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <ExerciseDatabase />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/analytics"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachAnalytics />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/business"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachBusiness />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/inbox"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachCheckinInbox />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/fms"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <FmsScreening />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/knowledge"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <KnowledgeBase />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/copilot"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <MasterCopilot />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />
              <Route
                path="/coach/settings"
                element={
                  <ProtectedCoachRoute>
                    <SubscriptionGuard>
                      <CoachSettings />
                    </SubscriptionGuard>
                  </ProtectedCoachRoute>
                }
              />

              {/* Athlete App — guarded shell + three pages.
                  ProtectedAthleteRoute handles: auth required, role===athlete,
                  onboarding_completed. Unauthenticated users → /auth; coaches
                  who land here → /coach. */}
              <Route
                path="/athlete"
                element={
                  <ProtectedAthleteRoute>
                    <AthleteLayout />
                  </ProtectedAthleteRoute>
                }
              >
                <Route index element={<AthleteDashboard />} />
                <Route path="training" element={<AthleteTraining />} />
                <Route path="profile" element={<AthleteProfile />} />
                {/* Read-only nutrition target — entitlement-gated (silent
                    redirect to /athlete when the tier lacks 'nutrition'). */}
                <Route
                  path="nutrition"
                  element={
                    <RequireNutritionEntitlement>
                      <AthleteNutrition />
                    </RequireNutritionEntitlement>
                  }
                />
              </Route>

              {/* Daily Check-in — sibling of the layout, NOT a child, because
                  the page is a modal-style full-screen flow with its own
                  sticky bottom action bar that replaces the BottomNavBar. */}
              <Route
                path="/athlete/daily-checkin"
                element={
                  <ProtectedAthleteRoute>
                    <DailyCheckin />
                  </ProtectedAthleteRoute>
                }
              />

              {/* Readiness Analysis — stack-pushed detail page with its own
                  back affordance; no bottom nav. Sibling, not child. */}
              <Route
                path="/athlete/readiness"
                element={
                  <ProtectedAthleteRoute>
                    <AthleteReadinessDetails />
                  </ProtectedAthleteRoute>
                }
              />

              {/* Weekly Check-in — focus-mode full-screen flow with its own
                  sticky bottom action bar. Sibling, not child (same reason
                  as DailyCheckin: two competing bottom bars otherwise). */}
              <Route
                path="/athlete/weekly-checkin"
                element={
                  <ProtectedAthleteRoute>
                    <WeeklyCheckin />
                  </ProtectedAthleteRoute>
                }
              />

              {/* Phase 6 — Session preview (phase overview) and single
                  exercise preview. Both are stack-pushed detail flows with
                  their own sticky CTA, so they sit as siblings of the
                  AthleteLayout rather than children. */}
              <Route
                path="/athlete/training/phase"
                element={
                  <ProtectedAthleteRoute>
                    <WorkoutPhaseDetail />
                  </ProtectedAthleteRoute>
                }
              />
              <Route
                path="/athlete/exercise-preview"
                element={
                  <ProtectedAthleteRoute>
                    <ExercisePreview />
                  </ProtectedAthleteRoute>
                }
              />

              {/* Phase 7 — Active Workout Hub (focus mode).
                  Full-screen overlay (z-50) that intentionally obscures
                  the global BottomNavBar; back/X opens a friction modal
                  rather than navigating immediately. */}
              <Route
                path="/athlete/active-workout"
                element={
                  <ProtectedAthleteRoute>
                    <ActiveWorkout />
                  </ProtectedAthleteRoute>
                }
              />

              {/* Phase 9 — Post-workout debrief + deep analytics surfaces.
                  All stack-pushed detail flows; siblings of the layout
                  so they own their own headers / CTAs without the
                  global BottomNavBar competing. */}
              <Route
                path="/athlete/post-workout"
                element={
                  <ProtectedAthleteRoute>
                    <PostWorkoutDebrief />
                  </ProtectedAthleteRoute>
                }
              />
              <Route
                path="/athlete/analytics"
                element={
                  <ProtectedAthleteRoute>
                    <TrainingAnalytics />
                  </ProtectedAthleteRoute>
                }
              />
              <Route
                path="/athlete/analytics/acwr"
                element={
                  <ProtectedAthleteRoute>
                    <AcwrAnalysis />
                  </ProtectedAthleteRoute>
                }
              />
              <Route
                path="/athlete/readiness/today"
                element={
                  <ProtectedAthleteRoute>
                    <DailyReadiness />
                  </ProtectedAthleteRoute>
                }
              />

              {/* Onboarding — intake config-driven, submit via edge fn (Fase 2) */}
              <Route path="/onboarding" element={<IntakeForm />} />

              {/* Legal */}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </OfflineSyncProvider>
  </ThemeProvider>
);

export default App;
