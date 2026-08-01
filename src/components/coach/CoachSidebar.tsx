/**
 * src/components/coach/CoachSidebar.tsx
 * ---------------------------------------------------------------------------
 * Aura Health System — Coach Sidebar (NC Performance Command Center).
 *
 * Visual spec (matches DESIGN.md + the elite sports-software reference
 * — Kitman Labs / CoachRx tier):
 *   - w-64 fixed, full height (h-screen via shadcn Sidebar), vertical
 *     flex column with brand on top, scrollable nav in the middle,
 *     system + identity pinned at the bottom.
 *   - Clean surface (bg-background / surface #f5faff), 1px right border
 *     outline-variant/20. No glassmorphism on the sidebar shell — the
 *     translucent treatment is reserved for the TopBar (Level 2 Aura).
 *   - 15 nav items organised in 4 semantic groups (OPERATIVE,
 *     PROGRAMMING & SCIENCE, INTELLIGENCE, SCALING) + a SYSTEM group
 *     in the footer (Impostazioni, Supporto).
 *   - All nav targets are strictly pill-shaped (rounded-full).
 *   - Active item: bg-primary-container + text-white (Aura primary fill).
 *   - Hover: bg-primary-container/10 + transition-all duration-200.
 *
 * The component keeps the shadcn `Sidebar` shell so the existing
 * collapsible="icon" / responsive behaviour from `CoachLayout` keeps
 * working. When collapsed the brand collapses to logo-only and labels
 * + badges + group headers are hidden, but the icons remain pill-shaped.
 *
 * Live data:
 *   - useCoachAlerts → unread `coach_alerts` count (Dashboard badge). The
 *     badge sits on Dashboard because that is where the list lives
 *     (CoachAlertsPanel on CoachHome): the number and the page it opens
 *     must refer to the same thing. It used to sit on Inbox, counting
 *     `coach_alerts` while Inbox renders weekly check-ins.
 *   - useChatRooms → sum of `unread_count` across rooms (Messaggi badge).
 *   - useAuth → user profile name + avatar + signOut.
 */
import { useMemo } from "react";
import { toast } from "sonner";

import {
  LayoutDashboard,
  Inbox,
  Users,
  Calendar,
  MessageSquare,
  FileText,
  Dumbbell,
  Activity,
  FolderOpen,
  Brain,
  Sparkles,
  TrendingUp,
  CreditCard,
  Settings,
  HelpCircle,
  ChevronLeft,
  LogOut,
  type LucideIcon,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FeedbackDialog } from "@/components/common/FeedbackDialog";
import { SunThemeToggle } from "@/components/SunThemeToggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useAuth } from "@/hooks/useAuth";
import { useCoachAlerts } from "@/hooks/useCoachAlerts";
import { useChatRooms } from "@/hooks/useChatRooms";
import { cn } from "@/lib/utils";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Nav model
// ---------------------------------------------------------------------------
interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Optional dynamic badge (count rendered as pill on the right) */
  badgeKey?: "alerts" | "messages";
  /** Match exactly (no nested-route highlight). Used for the Dashboard root. */
  end?: boolean;
}

interface NavSection {
  /** Tiny uppercase header above the group */
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Operative",
    items: [
      { title: "Dashboard", url: "/coach", icon: LayoutDashboard, end: true, badgeKey: "alerts" },
      { title: "Inbox", url: "/coach/inbox", icon: Inbox },
      { title: "Atleti", url: "/coach/athletes", icon: Users },
      { title: "Calendario", url: "/coach/calendar", icon: Calendar },
      { title: "Messaggi", url: "/coach/messages", icon: MessageSquare, badgeKey: "messages" },
    ],
  },
  {
    label: "Programming & Science",
    items: [
      { title: "Programmi", url: "/coach/programs", icon: FileText },
      { title: "Exercises", url: "/coach/exercises", icon: Dumbbell },
      { title: "Movement", url: "/coach/fms", icon: Activity },
      { title: "Resources", url: "/coach/library", icon: FolderOpen },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { title: "AI Brain", url: "/coach/knowledge", icon: Brain },
      { title: "Master Copilot", url: "/coach/copilot", icon: Sparkles },
      { title: "Analisi", url: "/coach/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Scaling",
    items: [{ title: "Business", url: "/coach/business", icon: CreditCard }],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CoachSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { user, profile, signOut } = useAuth();
  const { unreadCount } = useCoachAlerts();
  const { rooms } = useChatRooms();

  // ── Badge counters (live data) ─────────────────────────────────────────
  // `unreadCount`, not `alerts.length`: marking an alert read leaves the row
  // in place (it is only filtered on `dismissed`), so counting the rows would
  // keep the badge frozen after the coach has read everything.
  const badgeMap = useMemo(() => {
    const messagesCount = (rooms ?? []).reduce((sum, r) => sum + (r.unread_count ?? 0), 0);
    return { alerts: unreadCount, messages: messagesCount };
  }, [unreadCount, rooms]);

  // ── Profile derivations ────────────────────────────────────────────────
  const displayName = profile?.full_name?.trim() || user?.email?.split("@")[0] || "Coach";
  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "NC";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [displayName]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      log.error("Logout error:", e);
      toast.error("Errore durante il logout");
      window.location.href = "/auth";
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        // Clean surface — no glass on the sidebar (Aura DESIGN.md reserves
        // glassmorphism for the TopBar / modals). 1px outline-variant
        // border at 20% opacity gives the soft "card-edge" definition
        // without harsh dark borders.
        "border-r border-outline-variant/20",
        "[&_[data-sidebar=sidebar]]:bg-background [&_[data-sidebar=sidebar]]:border-r-0",
        "font-sans",
        isCollapsed ? "w-16" : "w-64",
      )}
    >
      {/* ─────────────────────────────────────────────────────────────
          1. BRAND BLOCK
          ───────────────────────────────────────────────────────────── */}
      <SidebarHeader className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div
            className={cn(
              "flex items-center gap-3 min-w-0",
              isCollapsed && "justify-center w-full",
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-container to-primary text-white shadow-[0_4px_14px_rgb(0_62_98_/_0.25)] flex-shrink-0">
              <span className="font-display text-label-md font-bold tracking-tight">NC</span>
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <h1 className="font-display text-label-md font-bold tracking-tight text-on-surface truncate">
                  NC Performance
                </h1>
                <p className="text-xs text-on-surface-variant truncate font-medium">
                  Coach Command Center
                </p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Comprimi menu laterale"
              onClick={toggleSidebar}
              className="h-8 w-8 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarHeader>

      {/* ─────────────────────────────────────────────────────────────
          2. MENU PRINCIPALE (scrollable)
          ───────────────────────────────────────────────────────────── */}
      <SidebarContent className="px-3 py-2 overflow-y-auto custom-scrollbar">
        <nav className="flex flex-col gap-5">
          {NAV_SECTIONS.map((section) => (
            <SidebarNavGroup
              key={section.label}
              label={section.label}
              items={section.items}
              isCollapsed={isCollapsed}
              badgeMap={badgeMap}
            />
          ))}
        </nav>
      </SidebarContent>

      {/* ─────────────────────────────────────────────────────────────
          3. SISTEMA & IDENTITY (pinned bottom)
          ───────────────────────────────────────────────────────────── */}
      <SidebarFooter
        className={cn(
          "border-t border-outline-variant/30 px-3 pt-4 pb-4 mt-auto space-y-3",
          isCollapsed && "px-2",
        )}
      >
        {/* System group */}
        {!isCollapsed && (
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Sistema
          </p>
        )}
        <ul className="space-y-1">
          <li>
            <SidebarLinkRow
              to="/coach/settings"
              icon={Settings}
              label="Impostazioni"
              isCollapsed={isCollapsed}
            />
          </li>
          <li>
            <FeedbackDialog
              trigger={
                <SidebarButtonRow icon={HelpCircle} label="Supporto" isCollapsed={isCollapsed} />
              }
            />
          </li>
        </ul>

        {/* Identity block */}
        <div
          className={cn(
            "mt-3 flex items-center gap-3 rounded-full p-1.5 bg-surface-container-low border border-outline-variant/20",
            isCollapsed && "justify-center bg-transparent border-transparent p-0",
          )}
        >
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Avatar className="h-10 w-10 border border-outline-variant flex-shrink-0">
                <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
                <AvatarFallback className="bg-primary-container text-on-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right">
                <p className="font-semibold">{displayName}</p>
                <p className="text-xs text-on-surface-variant">S&amp;C Coach</p>
              </TooltipContent>
            )}
          </Tooltip>

          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-on-surface font-bold text-label-md truncate">{displayName}</p>
                <p className="text-xs text-on-surface-variant truncate">S&amp;C Coach</p>
              </div>

              <Popover>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Tema e impostazioni rapide"
                        className="h-8 w-8 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high flex-shrink-0"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Tema</TooltipContent>
                </Tooltip>
                <PopoverContent align="end" side="top" className="w-72">
                  <SunThemeToggle />
                </PopoverContent>
              </Popover>

              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Logout"
                    onClick={handleLogout}
                    className="h-8 w-8 rounded-full text-on-surface-variant hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Esci</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

// ===========================================================================
// Subcomponents
// ===========================================================================

/** A semantic group of nav items with optional uppercase header */
function SidebarNavGroup({
  label,
  items,
  isCollapsed,
  badgeMap,
}: {
  label: string;
  items: NavItem[];
  isCollapsed: boolean;
  badgeMap: { alerts: number; messages: number };
}) {
  return (
    <div>
      {!isCollapsed && (
        <p
          className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
          aria-label={label}
        >
          {label}
        </p>
      )}
      <ul className="space-y-1">
        {items.map((item) => {
          const count = item.badgeKey ? badgeMap[item.badgeKey] : 0;
          return (
            <li key={item.title}>
              <SidebarLinkRow
                to={item.url}
                end={item.end}
                icon={item.icon}
                label={item.title}
                isCollapsed={isCollapsed}
                badge={
                  count > 0
                    ? { count, variant: item.badgeKey === "alerts" ? "error" : "primary" }
                    : undefined
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Pill-shaped nav link with Aura active/hover/focus states.
 *
 * Active rules (DESIGN.md):
 *   - bg-primary-container (#005685) + text-on-primary (white)
 *   - hover overrides locked back to primary fill so the row never
 *     flashes back to the soft hover tint while active
 *   - subtle ambient shadow that mirrors the auraCard treatment
 *
 * Inactive: text-on-surface-variant with hover surface-container-high
 * (slightly stronger than primary-container/10 for readability on the
 * sky-tinted background).
 */
function SidebarLinkRow({
  to,
  end,
  icon: Icon,
  label,
  isCollapsed,
  badge,
}: {
  to: string;
  end?: boolean;
  icon: LucideIcon;
  label: string;
  isCollapsed: boolean;
  badge?: { count: number; variant: "error" | "primary" };
}) {
  const node = (
    <NavLink
      to={to}
      end={end}
      className={cn(
        "group flex items-center gap-3 rounded-full transition-all duration-200",
        "text-label-md font-bold",
        "text-on-surface-variant",
        "hover:bg-primary-container/10 hover:text-on-surface",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isCollapsed ? "h-11 w-11 justify-center mx-auto" : "h-11 px-4 w-full",
      )}
      activeClassName={cn(
        // `text-white` over `text-on-primary` per la correzione Lovable
        // (d401e22) — semanticamente identici (on-primary == #ffffff)
        // ma più resiliente a future variazioni di palette.
        "bg-primary-container text-white shadow-[0_4px_14px_rgb(0_62_98_/_0.20)]",
        // Lock hover state so the row stays solid while active.
        "hover:bg-primary-container hover:text-white",
      )}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-[18px] w-[18px] flex-shrink-0",
              isActive ? "stroke-[2.25]" : "stroke-[1.75]",
            )}
          />
          {!isCollapsed && (
            <>
              <span className="flex-1 truncate text-left">{label}</span>
              {badge && (
                <NavBadge count={badge.count} variant={badge.variant} isActive={isActive} />
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right" className="font-semibold">
          <span>{label}</span>
          {badge && <span className="ml-2 text-xs text-on-surface-variant">({badge.count})</span>}
        </TooltipContent>
      </Tooltip>
    );
  }

  return node;
}

/** Pill-shaped button row for non-navigation actions (e.g. Supporto dialog). */
function SidebarButtonRow({
  icon: Icon,
  label,
  isCollapsed,
}: {
  icon: LucideIcon;
  label: string;
  isCollapsed: boolean;
}) {
  const className = cn(
    "group flex items-center gap-3 rounded-full transition-all duration-200",
    "text-label-md font-bold w-full text-left",
    "text-on-surface-variant hover:text-on-surface hover:bg-primary-container/10",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    isCollapsed ? "h-11 w-11 justify-center mx-auto" : "h-11 px-4",
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button type="button" className={className}>
            <Icon className="h-[18px] w-[18px] stroke-[1.75]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-semibold">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button type="button" className={className}>
      <Icon className="h-[18px] w-[18px] flex-shrink-0 stroke-[1.75]" />
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

/** Pill badge for unread counts on the right of a nav row */
function NavBadge({
  count,
  variant,
  isActive,
}: {
  count: number;
  variant: "error" | "primary";
  isActive: boolean;
}) {
  const display = count > 99 ? "99+" : String(count);
  // When the row is active (primary fill), use a high-contrast white pill
  // so the badge stays legible on the navy background.
  if (isActive) {
    return (
      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-3xs font-bold tabular-nums bg-white/20 text-white">
        {display}
      </span>
    );
  }
  const palette =
    variant === "error"
      ? "bg-destructive/10 text-destructive"
      : "bg-primary-container/15 text-primary";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-3xs font-bold tabular-nums",
        palette,
      )}
    >
      {display}
    </span>
  );
}
