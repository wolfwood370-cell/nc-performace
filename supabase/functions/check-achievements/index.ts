import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishableKey } from "../_shared/apiKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const athleteId = user.id;

    // Fetch existing badges for this user
    const { data: existingBadges } = await supabase
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", athleteId);

    const earnedIds = new Set((existingBadges || []).map((b: any) => b.badge_id));
    const newBadges: string[] = [];

    // Fetch completed workout count
    const { count: workoutCount } = await supabase
      .from("workout_logs")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .eq("status", "completed");

    const totalWorkouts = workoutCount || 0;

    // --- BADGE: first_step ---
    if (!earnedIds.has("first_step") && totalWorkouts >= 1) {
      newBadges.push("first_step");
    }

    // --- BADGE: iron_will (50 workouts) ---
    if (!earnedIds.has("iron_will") && totalWorkouts >= 50) {
      newBadges.push("iron_will");
    }

    // --- BADGE: centurion (100 workouts) ---
    if (!earnedIds.has("centurion") && totalWorkouts >= 100) {
      newBadges.push("centurion");
    }

    // --- BADGE: heavy_lifter (10,000kg in a single session) ---
    if (!earnedIds.has("heavy_lifter")) {
      const { data: recentLogs } = await supabase
        .from("workout_logs")
        .select("id, exercises_data")
        .eq("athlete_id", athleteId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(5);

      for (const log of recentLogs || []) {
        const exercises = log.exercises_data as any[];
        if (!Array.isArray(exercises)) continue;
        let sessionVolume = 0;
        for (const ex of exercises) {
          const sets = ex.sets_data || ex.sets || [];
          for (const set of sets) {
            const weight = set.weight_kg || set.weight || 0;
            const reps = set.reps || 0;
            if (set.completed !== false) {
              sessionVolume += weight * reps;
            }
          }
        }
        if (sessionVolume >= 10000) {
          newBadges.push("heavy_lifter");
          break;
        }
      }
    }

    // --- BADGE: on_fire (4-week streak) ---
    if (!earnedIds.has("on_fire")) {
      const { data: streakData } = await supabase
        .from("workout_logs")
        .select("completed_at")
        .eq("athlete_id", athleteId)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(100);

      const weekSet = new Set<string>();
      for (const log of streakData || []) {
        if (log.completed_at) {
          const d = new Date(log.completed_at);
          // ISO week key
          const jan1 = new Date(d.getFullYear(), 0, 1);
          const weekNum = Math.ceil(
            ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
          );
          weekSet.add(`${d.getFullYear()}-W${weekNum}`);
        }
      }

      // Check consecutive weeks from current week backwards
      const now = new Date();
      let consecutiveWeeks = 0;
      for (let i = 0; i < 12; i++) {
        const checkDate = new Date(now.getTime() - i * 7 * 86400000);
        const jan1 = new Date(checkDate.getFullYear(), 0, 1);
        const weekNum = Math.ceil(
          ((checkDate.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
        );
        const weekKey = `${checkDate.getFullYear()}-W${weekNum}`;
        if (weekSet.has(weekKey)) {
          consecutiveWeeks++;
        } else {
          break;
        }
      }

      if (consecutiveWeeks >= 4) {
        newBadges.push("on_fire");
      }
      if (consecutiveWeeks >= 8 && !earnedIds.has("consistency_king")) {
        newBadges.push("consistency_king");
      }
    }

    // --- BADGE: volume_beast (100,000kg total) ---
    if (!earnedIds.has("volume_beast")) {
      const { data: allLogs } = await supabase
        .from("workout_logs")
        .select("exercises_data")
        .eq("athlete_id", athleteId)
        .eq("status", "completed");

      let totalVolume = 0;
      for (const log of allLogs || []) {
        const exercises = log.exercises_data as any[];
        if (!Array.isArray(exercises)) continue;
        for (const ex of exercises) {
          const sets = ex.sets_data || ex.sets || [];
          for (const set of sets) {
            const weight = set.weight_kg || set.weight || 0;
            const reps = set.reps || 0;
            if (set.completed !== false) {
              totalVolume += weight * reps;
            }
          }
        }
      }
      if (totalVolume >= 100000) {
        newBadges.push("volume_beast");
      }
    }

    // Award new badges
    if (newBadges.length > 0) {
      const inserts = newBadges.map((badgeId) => ({
        user_id: athleteId,
        badge_id: badgeId,
      }));

      await supabase.from("user_badges").insert(inserts);

      // Fetch badge names for notifications
      const { data: badgeDefs } = await supabase
        .from("badges")
        .select("id, name")
        .in("id", newBadges);

      // Get coach_id for notification sender
      const { data: profile } = await supabase
        .from("profiles")
        .select("coach_id")
        .eq("id", athleteId)
        .single();

      // Send notifications
      for (const badge of badgeDefs || []) {
        await supabase.from("notifications").insert({
          user_id: athleteId,
          sender_id: profile?.coach_id || null,
          type: "badge_earned",
          message: `🏆 Nuova Medaglia Sbloccata: ${badge.name}!`,
          link_url: "/athlete/profile",
        });
      }
    }

    // Update leaderboard cache
    const { data: profileData } = await supabase
      .from("profiles")
      .select("coach_id")
      .eq("id", athleteId)
      .single();

    // Calculate week volume
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: weekLogs } = await supabase
      .from("workout_logs")
      .select("exercises_data")
      .eq("athlete_id", athleteId)
      .eq("status", "completed")
      .gte("completed_at", weekAgo.toISOString());

    let weekVolume = 0;
    for (const log of weekLogs || []) {
      const exercises = log.exercises_data as any[];
      if (!Array.isArray(exercises)) continue;
      for (const ex of exercises) {
        const sets = ex.sets_data || ex.sets || [];
        for (const set of sets) {
          const weight = set.weight_kg || set.weight || 0;
          const reps = set.reps || 0;
          if (set.completed !== false) weekVolume += weight * reps;
        }
      }
    }

    // Upsert leaderboard
    await supabase.from("leaderboard_cache").upsert(
      {
        user_id: athleteId,
        coach_id: profileData?.coach_id,
        week_volume: Math.round(weekVolume),
        workout_count: totalWorkouts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return new Response(
      JSON.stringify({
        newBadges,
        totalWorkouts,
        weekVolume: Math.round(weekVolume),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("check-achievements error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
