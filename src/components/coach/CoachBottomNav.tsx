import { LayoutDashboard, Users, ScanLine, Bot } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

const navItems = [
  { title: "Hub", url: "/coach", icon: LayoutDashboard, end: true },
  { title: "Roster", url: "/coach/athletes", icon: Users, end: false },
  { title: "Field", url: "/coach/fms", icon: ScanLine, end: false },
  { title: "Copilot", url: "/coach/copilot", icon: Bot, end: false },
];

export function CoachBottomNav() {
  const { light } = useHapticFeedback();

  const { data: brandColor } = useQuery({
    queryKey: ["coach-brand-color"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("brand_color")
        .eq("id", user.id)
        .single();
      return profile?.brand_color || null;
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Aura Health System — Glassmorphism (DESIGN.md "Level 2: Navigation").
          Translucent white + heavy backdrop-blur, outline-variant border
          at 20% opacity for a soft edge against varied content underneath. */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-t border-outline-variant/20" />

      <div className="relative flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.end}
            onClick={() => light()}
            className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-14 min-h-[56px] min-w-[56px] text-muted-foreground transition-transform duration-150 active:scale-90"
            activeClassName="text-primary"
          >
            {({ isActive }) => (
              <div className="relative flex flex-col items-center">
                {isActive && (
                  <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                    style={{ backgroundColor: brandColor || "hsl(var(--primary))" }}
                  />
                )}
                <div
                  className={cn(
                    "relative p-2 rounded-2xl transition-all duration-300 ease-out",
                    isActive && "bg-primary/10",
                  )}
                  style={
                    isActive && brandColor ? { backgroundColor: `${brandColor}15` } : undefined
                  }
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-all duration-300",
                      isActive ? "stroke-[2.5px]" : "stroke-[1.5px]",
                    )}
                    style={isActive ? { color: brandColor || undefined } : undefined}
                  />
                </div>
                <span
                  className={cn(
                    "text-3xs font-medium transition-all duration-300",
                    isActive && "font-semibold",
                  )}
                  style={isActive ? { color: brandColor || undefined } : undefined}
                >
                  {item.title}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
