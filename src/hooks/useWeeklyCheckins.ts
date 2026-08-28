import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface WeeklyCheckin {
  id: string;
  coach_id: string;
  athlete_id: string;
  week_start: string;
  status: "pending" | "approved" | "sent" | "skipped";
  ai_summary: string | null;
  coach_notes: string | null;
  // Mirror of what the edge actually writes (generate-batch-checkins →
  // _shared/program/weekAdherence.ts WeekSnapshotFields + calories). ALL
  // optional: compliance_pct / workouts_scheduled / total_volume are ABSENT
  // keys when the week has nothing to measure — the UI renders "—" and must
  // never fabricate a denominator for them.
  metrics_snapshot: {
    compliance_pct?: number;
    total_volume?: number;
    workouts_completed?: number;
    workouts_missed?: number;
    workouts_remaining?: number;
    workouts_scheduled?: number;
    sessions_completed?: number;
    off_plan_sessions?: number;
    avg_rpe?: string;
    avg_daily_calories?: number | null;
  } | null;
  created_at: string;
  updated_at: string;
  athlete?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useWeeklyCheckins() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const checkinsQuery = useQuery({
    queryKey: ["weekly-checkins", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("weekly_checkins")
        .select("*")
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Bridge cast through `unknown` is unavoidable here: the generated
      // `Tables<"weekly_checkins">` types `metrics_snapshot` as `Json` and
      // `status` as `string`, but the consumer-facing `WeeklyCheckin`
      // interface narrows them to a structured object and a union. Direct
      // `as WeeklyCheckin[]` would error TS2352. Replacing this would
      // require zod runtime validation at the boundary.
      const rows = (data ?? []) as unknown as WeeklyCheckin[];

      // Fetch athlete profiles
      const athleteIds = [...new Set(rows.map((c) => c.athlete_id))];
      if (athleteIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", athleteIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      return rows.map((c) => ({
        ...c,
        athlete: profileMap.get(c.athlete_id) ?? undefined,
      }));
    },
    enabled: !!user?.id,
  });

  const generateCheckins = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("generate-batch-checkins", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Analisi completata: ${data.count} atleti processati`);
      queryClient.invalidateQueries({ queryKey: ["weekly-checkins"] });
    },
    onError: (err: Error) => {
      toast.error(`Errore: ${err.message}`);
    },
  });

  const updateCheckin = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<WeeklyCheckin, "status" | "ai_summary" | "coach_notes">>;
    }) => {
      const { error } = await supabase.from("weekly_checkins").update(updates).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-checkins"] });
    },
  });

  const approveAndSend = useMutation({
    mutationFn: async (checkin: WeeklyCheckin) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const messageText = checkin.coach_notes || checkin.ai_summary || "";
      if (!messageText.trim()) throw new Error("No content to send");

      // Get or create direct room with athlete
      const { data: roomId, error: roomError } = await supabase.rpc("get_or_create_direct_room", {
        user_a: session.user.id,
        user_b: checkin.athlete_id,
      });

      if (roomError) throw roomError;

      // Send message
      const { error: msgError } = await supabase.from("messages").insert({
        room_id: roomId,
        sender_id: session.user.id,
        content: `Report Settimanale:\n\n${messageText}`,
        media_type: "text",
      });

      if (msgError) throw msgError;

      // Update status
      const { error: updateError } = await supabase
        .from("weekly_checkins")
        .update({ status: "sent" })
        .eq("id", checkin.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Report inviato all'atleta!");
      queryClient.invalidateQueries({ queryKey: ["weekly-checkins"] });
      queryClient.invalidateQueries({ queryKey: ["chat-rooms"] });
    },
    onError: (err: Error) => {
      toast.error(`Errore invio: ${err.message}`);
    },
  });

  return {
    checkins: checkinsQuery.data || [],
    isLoading: checkinsQuery.isLoading,
    error: checkinsQuery.error,
    generateCheckins,
    updateCheckin,
    approveAndSend,
  };
}
