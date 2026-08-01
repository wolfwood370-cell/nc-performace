import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface CoachAlert {
  id: string;
  coach_id: string;
  athlete_id: string;
  workout_log_id: string | null;
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  link: string | null;
  read: boolean;
  dismissed: boolean;
  created_at: string;
  athlete?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useCoachAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const alertsQuery = useQuery({
    queryKey: ["coach-alerts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("coach_alerts")
        .select(
          `          *,
          athlete:profiles!coach_alerts_athlete_id_fkey(id, full_name, avatar_url)
        `,
        )
        .eq("coach_id", user.id)
        .eq("dismissed", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as CoachAlert[];
    },
    enabled: !!user?.id,
    // Without this the query inherits `staleTime: Infinity` (src/main.tsx:16)
    // AND is restored from the 24h IndexedDB persister (src/main.tsx:32-36)
    // under `networkMode: 'offlineFirst'` — so a coach reopening the app
    // would be served yesterday's cached list and never refetch, while the
    // realtime subscription below only fires for INSERTs that happen with
    // the tab already open. Alerts written server-side while the app was
    // closed would stay invisible. 30s is short enough to catch them on
    // mount and long enough not to refetch on every coach-page navigation
    // (the hook remounts with the sidebar on each page).
    staleTime: 30_000,
  });

  // Realtime subscription for new alerts
  useEffect(() => {
    if (!user?.id) return;

    const channelName = `coach-alerts-${user.id}`;

    // Defensive: remove any stale channel with this topic before re-subscribing.
    // The Supabase client is a process-wide singleton — under HMR, cache reload,
    // or rapid re-mount the previous channel can survive in client.getChannels()
    // already in 'subscribed' state. Calling `.on()` on a subscribed channel
    // throws: "cannot add postgres_changes callbacks ... after subscribe()".
    supabase
      .getChannels()
      .filter((c) => c.topic === `realtime:${channelName}`)
      .forEach((c) => {
        supabase.removeChannel(c);
      });

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "coach_alerts",
          filter: `coach_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["coach-alerts"] });

          // Browser push notification
          if ("Notification" in window && Notification.permission === "granted") {
            const alert = payload.new as CoachAlert;
            new Notification("Risk Alert", {
              body: alert.message,
              icon: "/favicon.ico",
              tag: alert.id,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const dismissAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("coach_alerts")
        .update({ dismissed: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-alerts"] });
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("coach_alerts")
        .update({ read: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-alerts"] });
    },
  });

  const unreadCount = (alertsQuery.data || []).filter((a) => !a.read).length;

  return {
    alerts: alertsQuery.data || [],
    isLoading: alertsQuery.isLoading,
    // Every state other than a successful fetch looks exactly like an empty
    // inbox from the outside: `data` is undefined, so `alerts` is [] and
    // `unreadCount` is 0. `isLoading` does not cover them — it is
    // `isPending && isFetching`, so it is false both when the query has
    // errored (`retry: false` on 4xx, src/main.tsx:18-24, puts an RLS error
    // here on the first attempt) and when its retry is PAUSED offline
    // (`networkMode: 'offlineFirst'`, src/main.tsx:25 → `status: 'pending'`,
    // `fetchStatus: 'paused'`).
    // Exposed as the positive signal rather than as a list of failures:
    // consumers that decide whether to reassure the coach must key off "the
    // channel answered", so that any state we forgot — or that the library
    // adds later — reads as unknown instead of as good news.
    isSuccess: alertsQuery.isSuccess,
    unreadCount,
    dismissAlert,
    markAsRead,
  };
}
