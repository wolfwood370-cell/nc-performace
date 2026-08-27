import { useEffect, useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";
import { log } from "@/lib/logger";

// ============================================================================
// TYPES - Strict queue for athlete execution data ONLY
// ============================================================================

export interface SetData {
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe?: number;
  completed: boolean;
  [key: string]: Json | undefined;
}

export interface WorkoutExercise {
  exercise_name: string;
  exercise_order: number;
  sets_data: SetData[];
  notes?: string;
}

export interface WorkoutLogPayload {
  type: "workout_log";
  local_id: string;
  workout_id: string;
  athlete_id: string;
  started_at: string;
  completed_at?: string;
  srpe?: number;
  /** Seconds, like the online debrief path (A-02): duration_minutes is a
   *  VIEW-side rounding, never a stored datum. */
  duration_seconds?: number;
  exercises: WorkoutExercise[];
  notes?: string;
  /** sync_version captured when the athlete started the session */
  device_sync_version?: number;
}

export interface DailyReadinessPayload {
  type: "daily_readiness";
  local_id: string;
  athlete_id: string;
  date: string;
  sleep_hours?: number;
  sleep_quality?: number;
  energy?: number;
  mood?: number;
  stress_level?: number;
  soreness_map?: Json;
  notes?: string;
  /** Local edit timestamp (ms) — used for last-write-wins conflict resolution */
  client_updated_at?: number;
}

export interface DailyMetricsPayload {
  type: "daily_metrics";
  local_id: string;
  user_id: string;
  date: string;
  readiness_score?: number;
  sleep_hours?: number;
  hrv_ms?: number;
  body_weight_kg?: number;
  calories_consumed?: number;
  notes?: string;
  /** Local edit timestamp (ms) — used for last-write-wins conflict resolution */
  client_updated_at: number;
}

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

type AnyPayload = WorkoutLogPayload | DailyReadinessPayload | DailyMetricsPayload;

type QueueItem = {
  id: string;
  payload: AnyPayload;
  timestamp: number;
  retryCount: number;
  nextRetryAt?: number;
  status?: "pending" | "failed";
  lastErrorCode?: number;
};

// ============================================================================
// QUEUE STORAGE - Strict localStorage key for athlete workout data only
// ============================================================================

const QUEUE_KEY = "offline_workout_queue";
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;

function getBackoffMs(retryCount: number): number {
  return Math.min(MAX_BACKOFF_MS, Math.pow(2, retryCount) * 1000);
}

export function getQueue(): QueueItem[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    log.error("[OfflineSync] Failed to save queue:", e);
  }
}

function addToQueue(payload: AnyPayload): void {
  const queue = getQueue();
  queue.push({
    id: payload.local_id,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  });
  saveQueue(queue);
}

function removeFromQueue(id: string): void {
  const queue = getQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

function incrementRetry(id: string): void {
  const queue = getQueue().map((item) =>
    item.id === id
      ? {
          ...item,
          retryCount: item.retryCount + 1,
          nextRetryAt: Date.now() + getBackoffMs(item.retryCount + 1),
        }
      : item,
  );
  saveQueue(queue);
}

function markFailed(id: string, errorCode?: number): void {
  const queue = getQueue().map((item) =>
    item.id === id ? { ...item, status: "failed" as const, lastErrorCode: errorCode } : item,
  );
  saveQueue(queue);
}

// ============================================================================
// SYNC FUNCTIONS - Process queue items to Supabase (one by one)
// ============================================================================

async function syncWorkoutLog(payload: WorkoutLogPayload): Promise<void> {
  // --- Safe Append: detect if coach modified the workout while athlete was offline ---
  let conflictDetected = false;

  if (payload.device_sync_version != null) {
    const { data: serverWorkout } = await supabase
      .from("workouts")
      .select("sync_version")
      .eq("id", payload.workout_id)
      .maybeSingle();

    if (serverWorkout && (serverWorkout as any).sync_version > payload.device_sync_version) {
      // Coach edited while athlete was offline — flag the log but STILL save athlete data
      conflictDetected = true;
      log.warn(
        `[OfflineSync] Conflict: device v${payload.device_sync_version} < server v${(serverWorkout as any).sync_version}. Athlete data saved; coach edits preserved.`,
      );
    }
  }

  // Always INSERT into workout_logs (never upsert workouts — preserves coach planning)
  const { data: workoutLog, error: logError } = await supabase
    .from("workout_logs")
    .insert({
      workout_id: payload.workout_id,
      athlete_id: payload.athlete_id,
      started_at: payload.started_at,
      completed_at: payload.completed_at,
      srpe: payload.srpe,
      duration_seconds: payload.duration_seconds,
      notes: conflictDetected
        ? `[SYNC CONFLICT] ${payload.notes || ""} — Versione coach aggiornata durante sessione offline.`
        : payload.notes,
      local_id: payload.local_id,
      sync_status: "synced",
      // `WorkoutExercise[]` has named fields without a Json-compatible
      // index signature — the double cast is required even though the
      // runtime payload is plain JSON-serialisable.
      exercises_data: payload.exercises as unknown as Json,
    })
    .select("id")
    .single();

  if (logError) throw logError;

  // Insert exercise details
  if (payload.exercises.length > 0) {
    const exercisesData = payload.exercises.map((ex, index) => ({
      workout_log_id: workoutLog.id,
      exercise_name: ex.exercise_name,
      exercise_order: ex.exercise_order ?? index,
      sets_data: ex.sets_data as Json,
      notes: ex.notes ?? null,
    }));

    const { error: exercisesError } = await supabase
      .from("workout_exercises")
      .insert(exercisesData);

    if (exercisesError) throw exercisesError;
  }

  // Mark the workout as completed (status only — does NOT touch structure/title/description)
  await supabase
    .from("workouts")
    .update({ status: "completed" as any })
    .eq("id", payload.workout_id);
}

async function syncDailyReadiness(payload: DailyReadinessPayload): Promise<void> {
  // Timestamp-based conflict resolution: skip our write if the server row is newer.
  if (payload.client_updated_at) {
    const { data: serverRow } = await supabase
      .from("daily_readiness")
      .select("created_at")
      .eq("athlete_id", payload.athlete_id)
      .eq("date", payload.date)
      .maybeSingle();
    const serverTs = serverRow?.created_at ? new Date(serverRow.created_at).getTime() : 0;
    if (serverTs > payload.client_updated_at) {
      log.warn("[OfflineSync] Readiness server row newer — keeping server version.");
      return;
    }
  }

  const { error } = await supabase.from("daily_readiness").upsert(
    {
      athlete_id: payload.athlete_id,
      date: payload.date,
      sleep_hours: payload.sleep_hours,
      sleep_quality: payload.sleep_quality,
      energy: payload.energy,
      mood: payload.mood,
      stress_level: payload.stress_level,
      soreness_map: payload.soreness_map,
      notes: payload.notes,
    },
    {
      onConflict: "athlete_id,date",
    },
  );

  if (error) throw error;
}

async function syncDailyMetrics(payload: DailyMetricsPayload): Promise<void> {
  // Timestamp-based last-write-wins: compare server.updated_at vs client_updated_at.
  const { data: serverRow } = await supabase
    .from("daily_metrics")
    .select("updated_at")
    .eq("user_id", payload.user_id)
    .eq("date", payload.date)
    .maybeSingle();

  const serverTs = serverRow?.updated_at ? new Date(serverRow.updated_at).getTime() : 0;
  if (serverTs > payload.client_updated_at) {
    log.warn(
      `[OfflineSync] daily_metrics server row newer (server=${serverTs} > client=${payload.client_updated_at}). Skipping write.`,
    );
    return;
  }

  const { error } = await supabase.from("daily_metrics").upsert(
    {
      user_id: payload.user_id,
      date: payload.date,
      readiness_score: payload.readiness_score,
      sleep_hours: payload.sleep_hours,
      hrv_ms: payload.hrv_ms,
      body_weight_kg: payload.body_weight_kg,
      calories_consumed: payload.calories_consumed,
      notes: payload.notes,
    } as any,
    { onConflict: "user_id,date" },
  );

  if (error) throw error;
}

async function syncQueueItem(item: QueueItem): Promise<{ ok: boolean; statusCode?: number }> {
  try {
    if (item.payload.type === "workout_log") {
      await syncWorkoutLog(item.payload);
    } else if (item.payload.type === "daily_readiness") {
      await syncDailyReadiness(item.payload);
    } else if (item.payload.type === "daily_metrics") {
      await syncDailyMetrics(item.payload);
    }
    return { ok: true };
  } catch (error: any) {
    const statusCode = error?.code ? Number(error.code) : (error?.status ?? undefined);
    log.error(`[OfflineSync] Failed to sync ${item.id}:`, error);
    return { ok: false, statusCode };
  }
}

// ============================================================================
// HOOK - Athlete-only offline sync for workout execution
// ============================================================================

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const syncingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle",
  );
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const isServerError = (code?: number) => code != null && code >= 500;
  const isPermanentError = (code?: number) => code != null && code >= 400 && code < 500;

  // Process queue one-by-one with exponential backoff
  const processQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;

    syncingRef.current = true;
    const queue = getQueue();
    const pending = queue.filter((i) => i.status !== "failed");

    if (pending.length === 0) {
      syncingRef.current = false;
      setSyncStatus(queue.some((i) => i.status === "failed") ? "error" : "idle");
      return;
    }

    setSyncStatus("syncing");

    let syncedCount = 0;
    let failedCount = 0;
    let needsRetry = false;

    for (const item of pending) {
      // Skip items whose backoff hasn't elapsed yet
      if (item.nextRetryAt && Date.now() < item.nextRetryAt) {
        needsRetry = true;
        continue;
      }

      const result = await syncQueueItem(item);

      if (result.ok) {
        removeFromQueue(item.id);
        syncedCount++;
      } else if (isPermanentError(result.statusCode)) {
        // 4xx client errors → dead letter: discard immediately, never retry
        log.error(
          `[OfflineSync] Dead letter: item ${item.id} failed with permanent error ${result.statusCode}. Removing from queue.`,
          item.payload,
        );
        removeFromQueue(item.id);
        failedCount++;
      } else {
        // Transient errors (5xx, network) → retry with backoff up to MAX_RETRIES
        if (item.retryCount + 1 >= MAX_RETRIES) {
          if (isServerError(result.statusCode)) {
            markFailed(item.id, result.statusCode);
          } else {
            removeFromQueue(item.id);
          }
          failedCount++;
        } else {
          incrementRetry(item.id);
          needsRetry = true;
        }
      }
    }

    if (syncedCount > 0) {
      toast({
        title: "Workout offline sincronizzati",
        description: `${syncedCount} ${syncedCount === 1 ? "workout salvato" : "workout salvati"} con successo.`,
      });
      queryClient.invalidateQueries({ queryKey: ["workout-logs"] });
      queryClient.invalidateQueries({ queryKey: ["daily-readiness"] });
    }

    if (failedCount > 0) {
      toast({
        title: "Sincronizzazione fallita",
        description: `${failedCount} ${failedCount === 1 ? "elemento perso" : "elementi persi"} dopo 3 tentativi.`,
        variant: "destructive",
      });
    }

    syncingRef.current = false;

    // Schedule next retry pass if items remain with backoff
    if (needsRetry && navigator.onLine) {
      const remaining = getQueue().filter((i) => i.status !== "failed" && i.nextRetryAt);
      const nextAt = remaining.reduce(
        (min, i) => Math.min(min, i.nextRetryAt ?? Infinity),
        Infinity,
      );
      const delayMs = Math.max(500, nextAt - Date.now());
      setSyncStatus("error");
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => processQueue(), delayMs);
    } else {
      const hasErrors = getQueue().some((i) => i.status === "failed");
      setSyncStatus(hasErrors ? "error" : "idle");
    }
  }, [queryClient, toast]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus("idle");
      processQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial sync if online and queue has pending items
    if (navigator.onLine && getQueue().length > 0) {
      processQueue();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [processQueue]);

  // Mutation: Log workout (queues if offline)
  const logWorkoutMutation = useMutation({
    mutationFn: async (payload: Omit<WorkoutLogPayload, "type">) => {
      const fullPayload: WorkoutLogPayload = { ...payload, type: "workout_log" };

      if (navigator.onLine) {
        await syncWorkoutLog(fullPayload);
        return { synced: true, id: payload.local_id };
      } else {
        addToQueue(fullPayload);
        return { synced: false, id: payload.local_id };
      }
    },
    onSuccess: (result) => {
      toast({
        title: result.synced ? "Workout salvato" : "Workout salvato offline",
        description: result.synced
          ? "Dati sincronizzati."
          : "Verrà sincronizzato quando torni online.",
      });
      if (result.synced) {
        queryClient.invalidateQueries({ queryKey: ["workout-logs"] });
      }
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile salvare il workout.",
        variant: "destructive",
      });
    },
  });

  // Mutation: Log daily readiness (queues if offline)
  const logReadinessMutation = useMutation({
    mutationFn: async (payload: Omit<DailyReadinessPayload, "type">) => {
      const fullPayload: DailyReadinessPayload = { ...payload, type: "daily_readiness" };

      if (navigator.onLine) {
        await syncDailyReadiness(fullPayload);
        return { synced: true, id: payload.local_id };
      } else {
        addToQueue(fullPayload);
        return { synced: false, id: payload.local_id };
      }
    },
    onSuccess: (result) => {
      toast({
        title: result.synced ? "Check-in salvato" : "Check-in salvato offline",
        description: result.synced
          ? "Dati sincronizzati."
          : "Verrà sincronizzato quando torni online.",
      });
      if (result.synced) {
        queryClient.invalidateQueries({ queryKey: ["daily-readiness"] });
      }
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile salvare il check-in.",
        variant: "destructive",
      });
    },
  });

  // Mutation: Log/upsert daily metrics (queues if offline). Uses timestamp-based
  // last-write-wins resolution server-side.
  const logMetricsMutation = useMutation({
    mutationFn: async (
      payload: Omit<DailyMetricsPayload, "type" | "client_updated_at"> & {
        client_updated_at?: number;
      },
    ) => {
      const fullPayload: DailyMetricsPayload = {
        ...payload,
        type: "daily_metrics",
        client_updated_at: payload.client_updated_at ?? Date.now(),
      };

      if (navigator.onLine) {
        try {
          await syncDailyMetrics(fullPayload);
          return { synced: true, id: payload.local_id };
        } catch (e) {
          // Network/transient — queue for retry instead of failing the UI.
          addToQueue(fullPayload);
          return { synced: false, id: payload.local_id };
        }
      } else {
        addToQueue(fullPayload);
        return { synced: false, id: payload.local_id };
      }
    },
    onSuccess: (result) => {
      if (result.synced) {
        queryClient.invalidateQueries({ queryKey: ["daily-metrics"] });
      }
    },
  });

  return {
    // Status
    isOnline,
    syncStatus,
    pendingCount: getQueue().length,

    // Workout logging (athlete only)
    logWorkout: logWorkoutMutation.mutate,
    logWorkoutAsync: logWorkoutMutation.mutateAsync,
    isLoggingWorkout: logWorkoutMutation.isPending,

    // Readiness logging (athlete only)
    logReadiness: logReadinessMutation.mutate,
    logReadinessAsync: logReadinessMutation.mutateAsync,
    isLoggingReadiness: logReadinessMutation.isPending,

    // Daily metrics (wearables / nutrition / body weight)
    logMetrics: logMetricsMutation.mutate,
    logMetricsAsync: logMetricsMutation.mutateAsync,
    isLoggingMetrics: logMetricsMutation.isPending,

    // Manual sync trigger
    forceSync: processQueue,
  };
}
