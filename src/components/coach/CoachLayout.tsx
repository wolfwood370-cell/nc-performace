import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { CoachSidebar } from "./CoachSidebar";
import { CoachBottomNav } from "./CoachBottomNav";
import { AlertTriangle, Search, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/** Compact fallback for the coach content area. Keeps the sidebar +
 *  header chrome usable so the user can navigate to a different
 *  coach page without losing the entire app shell. */
function CoachSectionErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 rounded-lg border border-destructive/30 bg-destructive/5 my-6">
      <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Errore nella pagina</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        Si è verificato un problema nel caricamento di questa sezione. Usa la barra laterale per
        spostarti altrove o ricarica.
      </p>
      <pre className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground overflow-auto max-h-24 max-w-md text-left">
        {error.message}
      </pre>
      <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
        Ricarica
      </Button>
    </div>
  );
}

interface CoachLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

function CoachHeader({ title }: { title?: string; subtitle?: string }) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    // Aura Health System — Glassmorphism (DESIGN.md "Level 2: Navigation").
    // Semi-transparent surface + backdrop blur so scrolled content stays
    // visible underneath, reinforcing depth. Outline at 20% opacity per spec.
    <header className="sticky top-0 z-30 h-14 border-b border-outline-variant/20 bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Apri menu laterale"
            onClick={toggleSidebar}
            className="hidden md:inline-flex h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* Page title for mobile */}
        {title && (
          <div className="md:hidden">
            <h1 className="text-sm font-semibold">{title}</h1>
          </div>
        )}

        {/* Search - Desktop only */}
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca atleti, programmi..."
            className="pl-9 w-72 h-9 bg-secondary/50 border-0 text-sm placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
      </div>
    </header>
  );
}

export function CoachLayout({ children, title, subtitle }: CoachLayoutProps) {
  return (
    <div className="theme-coach">
      <SidebarProvider defaultOpen={true}>
        {/* Aura Health System — base surface from the design tokens
            (no more hardcoded bg-slate-50). Dark variant inherits via
            the same CSS vars. */}
        <div className="min-h-screen flex w-full bg-background">
          {/* Sidebar - desktop only */}
          <div className="hidden md:flex">
            <CoachSidebar />
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <CoachHeader title={title} subtitle={subtitle} />

            {/* Main Content — also pinned to the Aura surface (no more
                bg-slate-* override). pb-20 keeps clearance for the bottom
                nav on mobile (handled by safe-area inset below). */}
            <main
              className="flex-1 overflow-auto p-4 lg:p-6 bg-background pb-20 md:pb-6"
              style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
            >
              {/* Page Header - Desktop */}
              {(title || subtitle) && (
                <div className="mb-6 hidden lg:block">
                  {title && (
                    <h1 className="text-xl font-semibold text-foreground tracking-tight">
                      {title}
                    </h1>
                  )}
                  {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
                </div>
              )}
              <ErrorBoundary fallback={(error) => <CoachSectionErrorFallback error={error} />}>
                {children}
              </ErrorBoundary>
            </main>
          </div>

          {/* Bottom nav - mobile only */}
          <CoachBottomNav />
        </div>
      </SidebarProvider>
    </div>
  );
}
