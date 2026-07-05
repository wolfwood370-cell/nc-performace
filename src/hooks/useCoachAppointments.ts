/**
 * src/hooks/useCoachAppointments.ts
 * ---------------------------------------------------------------------------
 * Fetch the coach's appointments for a given date range, shaped for
 * `CalendarGrid` consumption.
 *
 * Closes audit finding M3 (MOCK_APPOINTMENTS in CoachCalendar). Table
 * created by migration `20260519120000_appointments.sql`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CalendarAppointment } from "@/components/coach/calendar/CalendarGrid";

interface UseCoachAppointmentsParams {
  /** ISO date `yyyy-MM-dd` inclusive */
  startDate: string;
  /** ISO date `yyyy-MM-dd` inclusive */
  endDate: string;
}

export function useCoachAppointments({ startDate, endDate }: UseCoachAppointmentsParams) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["coach-appointments", user?.id, startDate, endDate],
    queryFn: async (): Promise<CalendarAppointment[]> => {
      if (!user?.id) return [];

      const { data, error } = await (supabase as any)
        .from("appointments")
        .select("id, title, type, date, time")
        .eq("coach_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) throw error;

      return ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        title: row.title,
        type:
          row.type === "check-in" || row.type === "pt-session" || row.type === "other"
            ? row.type
            : "other",
        date: row.date,
        time: row.time ?? "",
      }));
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  return {
    appointments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
