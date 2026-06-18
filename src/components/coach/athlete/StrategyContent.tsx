import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Flame,
  Target,
  TrendingDown,
  TrendingUp,
  Minus,
  Save,
  Loader2,
  Plus,
  CheckCircle2,
  Leaf,
  Moon,
  Brain,
  Sparkles,
  Apple,
  Trash2,
  Zap,
  Calendar,
  Calculator,
  RefreshCw,
  Dumbbell,
  Coffee,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { format, addDays, startOfWeek } from "date-fns";
import { log } from "@/lib/logger";
import { NutritionAdherenceCard } from "@/components/coach/analytics/NutritionAdherenceCard";

// Define chart data type for proper TypeScript typing
interface MacroChartEntry {
  name: string;
  value: number;
  grams: number;
  kcal: number;
  color: string;
}

interface StrategyContentProps {
  athleteId: string | undefined;
}

type StrategyType = "cut" | "maintain" | "bulk";
type StrategyMode = "static" | "cycling_on_off" | "custom_daily";
type HabitCategory = "recovery" | "nutrition" | "mindset";
type HabitFrequency = "daily" | "weekly" | "as_needed";

interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface CyclingTargets {
  on: MacroTargets;
  off: MacroTargets;
}

interface NutritionPlan {
  id: string;
  athlete_id: string;
  coach_id: string;
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  strategy_type: StrategyType;
  strategy_mode: StrategyMode;
  cycling_targets: CyclingTargets | null;
  weekly_weight_goal: number;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface HabitLibraryItem {
  id: string;
  coach_id: string;
  name: string;
  category: HabitCategory;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface AthleteHabit {
  id: string;
  athlete_id: string;
  habit_id: string;
  frequency: HabitFrequency;
  active: boolean;
  created_at: string;
  updated_at: string;
  habit?: HabitLibraryItem;
}

interface ScheduledWorkout {
  date: string;
  hasWorkout: boolean;
  workoutName?: string;
}

const CATEGORY_CONFIG: Record<
  HabitCategory,
  { label: string; icon: React.ElementType; color: string }
> = {
  recovery: { label: "Recovery", icon: Moon, color: "text-blue-500" },
  nutrition: { label: "Nutrition", icon: Apple, color: "text-green-500" },
  mindset: { label: "Mindset", icon: Brain, color: "text-purple-500" },
};

const STRATEGY_CONFIG: Record<
  StrategyType,
  { label: string; icon: React.ElementType; color: string; description: string }
> = {
  cut: {
    label: "Cut",
    icon: TrendingDown,
    color: "text-orange-500",
    description: "Deficit calorico per perdita peso",
  },
  maintain: {
    label: "Maintain",
    icon: Minus,
    color: "text-blue-500",
    description: "Mantenimento peso attuale",
  },
  bulk: {
    label: "Bulk",
    icon: TrendingUp,
    color: "text-green-500",
    description: "Surplus calorico per aumento massa",
  },
};

// Macro colors as per requirements
const MACRO_COLORS = {
  protein: "#EF4444", // Red
  fats: "#EAB308", // Yellow
  carbs: "#22C55E", // Green
};

// Day labels in Italian
const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function StrategyContent({ athleteId }: StrategyContentProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Strategy mode state
  const [strategyMode, setStrategyMode] = useState<StrategyMode>("static");
  const [hasInitializedCycling, setHasInitializedCycling] = useState(false);

  // Static targets state
  const [calories, setCalories] = useState(2000);
  const [protein, setProtein] = useState(150);
  const [carbs, setCarbs] = useState(200);
  const [fats, setFats] = useState(70);

  // Cycling targets state
  const [onDayTargets, setOnDayTargets] = useState<MacroTargets>({
    calories: 2800,
    protein: 200,
    carbs: 300,
    fats: 80,
  });
  const [offDayTargets, setOffDayTargets] = useState<MacroTargets>({
    calories: 2200,
    protein: 180,
    carbs: 200,
    fats: 70,
  });

  // Handle strategy mode changes - smart defaults
  const handleStrategyModeChange = (newMode: StrategyMode) => {
    if (newMode === "cycling_on_off" && !hasInitializedCycling && strategyMode === "static") {
      // Pre-fill cycling targets with current static values
      const staticTargets: MacroTargets = { calories, protein, carbs, fats };
      setOnDayTargets({
        calories: Math.round(calories * 1.15), // +15% for training days
        protein: protein,
        carbs: Math.round(carbs * 1.3), // +30% carbs on training
        fats: fats,
      });
      setOffDayTargets({
        calories: Math.round(calories * 0.85), // -15% for rest days
        protein: protein,
        carbs: Math.round(carbs * 0.7), // -30% carbs on rest
        fats: Math.round(fats * 1.1), // Slightly higher fats
      });
      setHasInitializedCycling(true);
    }
    setStrategyMode(newMode);
  };

  // Math Guard: Calculate actual calories from macros
  const calculateCaloriesFromMacros = (targets: MacroTargets) => {
    return targets.protein * 4 + targets.carbs * 4 + targets.fats * 9;
  };

  const staticCalculatedCalories = calculateCaloriesFromMacros({
    calories,
    protein,
    carbs,
    fats,
  });
  const onDayCalculatedCalories = calculateCaloriesFromMacros(onDayTargets);
  const offDayCalculatedCalories = calculateCaloriesFromMacros(offDayTargets);

  const staticCalorieDiff = Math.abs(calories - staticCalculatedCalories);
  const onDayCalorieDiff = Math.abs(onDayTargets.calories - onDayCalculatedCalories);
  const offDayCalorieDiff = Math.abs(offDayTargets.calories - offDayCalculatedCalories);

  // Auto-fix functions for Math Guard
  const autoFixStaticCalories = () => {
    setCalories(staticCalculatedCalories);
  };

  const autoFixOnDayCalories = () => {
    setOnDayTargets((prev) => ({ ...prev, calories: onDayCalculatedCalories }));
  };

  const autoFixOffDayCalories = () => {
    setOffDayTargets((prev) => ({
      ...prev,
      calories: offDayCalculatedCalories,
    }));
  };

  // Smart assistant state
  const [weeklyAvgGoal, setWeeklyAvgGoal] = useState(2500);
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState(4);
  const [autoCalcEnabled, setAutoCalcEnabled] = useState(false);

  // Other form state
  const [strategyType, setStrategyType] = useState<StrategyType>("maintain");
  const [weeklyWeightGoal, setWeeklyWeightGoal] = useState(0);

  // Dialog state
  const [addHabitOpen, setAddHabitOpen] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitCategory, setNewHabitCategory] = useState<HabitCategory>("nutrition");
  const [newHabitDescription, setNewHabitDescription] = useState("");
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  // Fetch active nutrition plan for athlete
  const { data: nutritionPlan, isLoading: planLoading } = useQuery({
    queryKey: ["nutrition-plan", athleteId],
    queryFn: async () => {
      if (!athleteId) return null;
      const { data, error } = await supabase
        .from("nutrition_plans")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Transform the data to match our interface
      return {
        ...data,
        strategy_mode: (data.strategy_mode || "static") as StrategyMode,
        // JSONB column read: `cycling_targets` is typed as `Json` by
        // Supabase but consumed as a structured `CyclingTargets`. Bridge
        // through `unknown` is the only TS-accepted narrowing.
        cycling_targets: data.cycling_targets as unknown as CyclingTargets | null,
      } as NutritionPlan;
    },
    enabled: !!athleteId,
  });

  // Fetch scheduled workouts for this week
  const { data: weekSchedule } = useQuery({
    queryKey: ["athlete-week-schedule", athleteId],
    queryFn: async () => {
      if (!athleteId) return [];

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);

      const { data, error } = await supabase
        .from("workout_logs")
        .select("scheduled_date, status, workout_id")
        .eq("athlete_id", athleteId)
        .gte("scheduled_date", format(weekStart, "yyyy-MM-dd"))
        .lte("scheduled_date", format(weekEnd, "yyyy-MM-dd"));

      if (error) throw error;

      // Create 7-day array
      const schedule: ScheduledWorkout[] = [];
      for (let i = 0; i < 7; i++) {
        const date = format(addDays(weekStart, i), "yyyy-MM-dd");
        const workoutsOnDay = data?.filter((w) => w.scheduled_date === date) || [];
        schedule.push({
          date,
          hasWorkout: workoutsOnDay.length > 0,
          workoutName: workoutsOnDay.length > 0 ? `${workoutsOnDay.length} sessione/i` : undefined,
        });
      }

      return schedule;
    },
    enabled: !!athleteId,
  });

  // Update form when plan loads
  useEffect(() => {
    if (nutritionPlan) {
      setStrategyMode((nutritionPlan.strategy_mode as StrategyMode) || "static");
      setCalories(nutritionPlan.daily_calories);
      setProtein(nutritionPlan.protein_g);
      setCarbs(nutritionPlan.carbs_g);
      setFats(nutritionPlan.fats_g);
      setStrategyType(nutritionPlan.strategy_type as StrategyType);
      setWeeklyWeightGoal(Number(nutritionPlan.weekly_weight_goal) || 0);

      if (nutritionPlan.cycling_targets) {
        const ct = nutritionPlan.cycling_targets as CyclingTargets;
        if (ct.on) setOnDayTargets(ct.on);
        if (ct.off) setOffDayTargets(ct.off);
      }
    }
  }, [nutritionPlan]);

  // Fetch habits library for this coach
  const { data: habitsLibrary, isLoading: habitsLoading } = useQuery({
    queryKey: ["habits-library", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("habits_library")
        .select("*")
        .eq("coach_id", user.id)
        .order("category", { ascending: true });

      if (error) throw error;
      return data as HabitLibraryItem[];
    },
    enabled: !!user?.id,
  });

  // Fetch assigned habits for this athlete
  const { data: athleteHabits, isLoading: athleteHabitsLoading } = useQuery({
    queryKey: ["athlete-habits", athleteId],
    queryFn: async () => {
      if (!athleteId) return [];
      const { data, error } = await supabase
        .from("athlete_habits")
        .select(
          `          *,
          habit:habits_library(*)
        `,
        )
        .eq("athlete_id", athleteId);

      if (error) throw error;
      return data as AthleteHabit[];
    },
    enabled: !!athleteId,
  });

  // Smart Assistant: Auto-calculate rest day calories
  const calculateRestDayCalories = () => {
    const restDays = 7 - trainingDaysPerWeek;
    if (restDays <= 0) return offDayTargets.calories;

    const neededRestCals =
      (weeklyAvgGoal * 7 - onDayTargets.calories * trainingDaysPerWeek) / restDays;
    return Math.max(1200, Math.round(neededRestCals));
  };

  const applySmartCalc = () => {
    const restCals = calculateRestDayCalories();
    // Scale macros proportionally
    const ratio = restCals / onDayTargets.calories;
    setOffDayTargets({
      calories: restCals,
      protein: Math.round(onDayTargets.protein * 0.9), // Keep protein high
      carbs: Math.round(onDayTargets.carbs * ratio * 0.8), // Lower carbs on rest days
      fats: Math.round(onDayTargets.fats * ratio * 1.1), // Slightly higher fats
    });
    toast.success("Calorie giorni di riposo calcolate!");
  };

  // Save nutrition plan mutation
  const savePlanMutation = useMutation({
    mutationFn: async () => {
      if (!athleteId || !user?.id) throw new Error("Missing IDs");

      // Deactivate existing plans
      if (nutritionPlan) {
        await supabase
          .from("nutrition_plans")
          .update({ active: false })
          .eq("athlete_id", athleteId)
          .eq("active", true);
      }

      const cyclingTargetsJson =
        strategyMode === "cycling_on_off"
          ? JSON.parse(JSON.stringify({ on: onDayTargets, off: offDayTargets }))
          : null;

      // Insert new plan
      const { error } = await supabase.from("nutrition_plans").insert([
        {
          athlete_id: athleteId,
          coach_id: user.id,
          daily_calories: strategyMode === "static" ? calories : onDayTargets.calories,
          protein_g: strategyMode === "static" ? protein : onDayTargets.protein,
          carbs_g: strategyMode === "static" ? carbs : onDayTargets.carbs,
          fats_g: strategyMode === "static" ? fats : onDayTargets.fats,
          strategy_type: strategyType,
          strategy_mode: strategyMode,
          cycling_targets: cyclingTargetsJson,
          weekly_weight_goal: weeklyWeightGoal,
          active: true,
        },
      ]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["nutrition-plan", athleteId],
      });
      toast.success("Strategia nutrizionale salvata!");
    },
    onError: (error) => {
      toast.error("Errore nel salvare la strategia");
      log.error(error);
    },
  });

  // Create habit mutation
  const createHabitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("habits_library")
        .insert({
          coach_id: user.id,
          name: newHabitName,
          category: newHabitCategory,
          description: newHabitDescription || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["habits-library"] });
      setNewHabitName("");
      setNewHabitDescription("");
      setSelectedHabitId(data.id);
      toast.success("Habit creato!");
    },
    onError: (error) => {
      toast.error("Errore nella creazione dell'habit");
      log.error(error);
    },
  });

  // Assign habit to athlete mutation
  const assignHabitMutation = useMutation({
    mutationFn: async (habitId: string) => {
      if (!athleteId) throw new Error("Missing athlete ID");

      const { error } = await supabase.from("athlete_habits").insert({
        athlete_id: athleteId,
        habit_id: habitId,
        frequency: "daily",
        active: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["athlete-habits", athleteId],
      });
      setAddHabitOpen(false);
      setSelectedHabitId(null);
      toast.success("Habit assegnato!");
    },
    onError: (error) => {
      toast.error("Errore nell'assegnazione dell'habit");
      log.error(error);
    },
  });

  // Toggle habit active state mutation
  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, active }: { habitId: string; active: boolean }) => {
      const { error } = await supabase.from("athlete_habits").update({ active }).eq("id", habitId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["athlete-habits", athleteId],
      });
    },
    onError: (error) => {
      toast.error("Errore nell'aggiornamento dell'habit");
      log.error(error);
    },
  });

  // Remove habit mutation
  const removeHabitMutation = useMutation({
    mutationFn: async (habitId: string) => {
      const { error } = await supabase.from("athlete_habits").delete().eq("id", habitId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["athlete-habits", athleteId],
      });
      toast.success("Habit rimosso");
    },
    onError: (error) => {
      toast.error("Errore nella rimozione dell'habit");
      log.error(error);
    },
  });

  // Calculate macro data for donut chart
  const getMacroChartData = (targets: MacroTargets): MacroChartEntry[] => {
    const proteinCals = targets.protein * 4;
    const carbsCals = targets.carbs * 4;
    const fatsCals = targets.fats * 9;
    const total = proteinCals + carbsCals + fatsCals;

    return [
      {
        name: "Proteine",
        value: Math.round((proteinCals / total) * 100),
        grams: targets.protein,
        kcal: proteinCals,
        color: MACRO_COLORS.protein,
      },
      {
        name: "Carboidrati",
        value: Math.round((carbsCals / total) * 100),
        grams: targets.carbs,
        kcal: carbsCals,
        color: MACRO_COLORS.carbs,
      },
      {
        name: "Grassi",
        value: Math.round((fatsCals / total) * 100),
        grams: targets.fats,
        kcal: fatsCals,
        color: MACRO_COLORS.fats,
      },
    ];
  };

  const staticMacroData = useMemo(
    () => getMacroChartData({ calories, protein, carbs, fats }),
    [calories, protein, carbs, fats],
  );
  const onDayMacroData = useMemo(() => getMacroChartData(onDayTargets), [onDayTargets]);
  const offDayMacroData = useMemo(() => getMacroChartData(offDayTargets), [offDayTargets]);

  // Get habits not yet assigned to this athlete
  const availableHabits = useMemo(() => {
    if (!habitsLibrary || !athleteHabits) return [];
    const assignedIds = new Set(athleteHabits.map((ah) => ah.habit_id));
    return habitsLibrary.filter((h) => !assignedIds.has(h.id));
  }, [habitsLibrary, athleteHabits]);

  // Group athlete habits by category
  const groupedHabits = useMemo(() => {
    if (!athleteHabits) return {};
    return athleteHabits.reduce(
      (acc, ah) => {
        const category = ah.habit?.category || "nutrition";
        if (!acc[category]) acc[category] = [];
        acc[category].push(ah);
        return acc;
      },
      {} as Record<HabitCategory, AthleteHabit[]>,
    );
  }, [athleteHabits]);

  // Calculate weekly average from cycling targets
  const currentWeeklyAverage = useMemo(() => {
    if (strategyMode !== "cycling_on_off") return null;
    const trainingCals = onDayTargets.calories * trainingDaysPerWeek;
    const restCals = offDayTargets.calories * (7 - trainingDaysPerWeek);
    return Math.round((trainingCals + restCals) / 7);
  }, [strategyMode, onDayTargets.calories, offDayTargets.calories, trainingDaysPerWeek]);

  // Custom Donut Chart component
  const MacroDonutChart = ({
    data,
    title,
    totalCals,
  }: {
    data: MacroChartEntry[];
    title: string;
    totalCals: number;
  }) => (
    <div className="flex flex-col items-center">
      <p className="text-sm font-medium mb-2">{title}</p>
      <div className="w-[200px] h-[200px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as MacroChartEntry;
                return (
                  <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
                    <p className="font-medium" style={{ color: d.color }}>
                      {d.name}
                    </p>
                    <p>
                      {d.grams}g • {d.kcal} kcal
                    </p>
                    <p className="text-muted-foreground">{d.value}% del totale</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold">{totalCals}</span>
          <span className="text-xs text-muted-foreground">kcal</span>
        </div>
      </div>
      {/* Legend */}
      <div className="flex gap-3 mt-3 text-xs">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.grams}g</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Math Guard Badge component
  const MathGuardBadge = ({
    targetCalories,
    calculatedCalories,
    onAutoFix,
  }: {
    targetCalories: number;
    calculatedCalories: number;
    onAutoFix: () => void;
  }) => {
    const diff = Math.abs(targetCalories - calculatedCalories);
    const showWarning = diff > 50;

    if (!showWarning) return null;

    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/50">
          <span className="text-amber-500"></span>Δ {diff} kcal
        </Badge>
        <span className="text-xs text-amber-600">Macro = {calculatedCalories} kcal</span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs ml-auto border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
          onClick={onAutoFix}
        >
          <Zap className="h-3 w-3 mr-1" />
          Auto-Fix
        </Button>
      </div>
    );
  };

  // Macro Input Grid component
  const MacroInputGrid = ({
    targets,
    setTargets,
    label,
    calculatedCalories,
    onAutoFix,
  }: {
    targets: MacroTargets;
    setTargets: (t: MacroTargets) => void;
    label: string;
    calculatedCalories: number;
    onAutoFix: () => void;
  }) => {
    const calorieDiff = Math.abs(targets.calories - calculatedCalories);
    const showWarning = calorieDiff > 50;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {label === "Training Days" ? (
            <Dumbbell className="h-4 w-4 text-orange-500" />
          ) : (
            <Coffee className="h-4 w-4 text-blue-500" />
          )}
          <span className="font-medium text-sm">{label}</span>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Calorie</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={targets.calories}
                onChange={(e) => setTargets({ ...targets, calories: Number(e.target.value) })}
                className="w-24 h-9"
              />
              <span className="text-xs text-muted-foreground">kcal</span>
            </div>
          </div>

          {/* Math Guard Warning */}
          {showWarning && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/50 text-xs">
                Δ{calorieDiff}
              </Badge>
              <span className="text-xs text-amber-600 hidden sm:inline">
                Macro = {calculatedCalories}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs ml-auto text-amber-600"
                onClick={onAutoFix}
              >
                <Zap className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: MACRO_COLORS.protein }}
                />
                Prot
              </Label>
              <Input
                type="number"
                value={targets.protein}
                onChange={(e) => setTargets({ ...targets, protein: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: MACRO_COLORS.carbs }}
                />
                Carb
              </Label>
              <Input
                type="number"
                value={targets.carbs}
                onChange={(e) => setTargets({ ...targets, carbs: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: MACRO_COLORS.fats }}
                />
                Grassi
              </Label>
              <Input
                type="number"
                value={targets.fats}
                onChange={(e) => setTargets({ ...targets, fats: Number(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (planLoading || habitsLoading || athleteHabitsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A: Nutrition Protocol */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Flame className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Protocollo Nutrizionale v2.0</CardTitle>
                <CardDescription>Target statici o cycling training/rest</CardDescription>
              </div>
            </div>

            {/* Strategy Mode Toggle */}
            <Tabs
              value={strategyMode}
              onValueChange={(v) => handleStrategyModeChange(v as StrategyMode)}
            >
              <TabsList>
                <TabsTrigger value="static" className="gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Static
                </TabsTrigger>
                <TabsTrigger value="cycling_on_off" className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Cycling
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {strategyMode === "static" ? (
            /* STATIC MODE */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Inputs */}
              <div className="space-y-5">
                {/* Calories */}
                <div className="space-y-2">
                  <Label htmlFor="calories" className="text-sm font-medium">
                    Calorie Giornaliere
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="calories"
                      type="number"
                      value={calories}
                      onChange={(e) => setCalories(Number(e.target.value))}
                      className="w-28 text-lg font-semibold"
                    />
                    <span className="text-muted-foreground">kcal</span>
                  </div>
                </div>

                {/* Macros */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="protein"
                      className="text-sm font-medium flex items-center gap-1.5"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: MACRO_COLORS.protein }}
                      />
                      Proteine
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="protein"
                        type="number"
                        value={protein}
                        onChange={(e) => setProtein(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">g</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="carbs"
                      className="text-sm font-medium flex items-center gap-1.5"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: MACRO_COLORS.carbs }}
                      />
                      Carbs
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="carbs"
                        type="number"
                        value={carbs}
                        onChange={(e) => setCarbs(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">g</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fats" className="text-sm font-medium flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: MACRO_COLORS.fats }}
                      />
                      Grassi
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="fats"
                        type="number"
                        value={fats}
                        onChange={(e) => setFats(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">g</span>
                    </div>
                  </div>
                </div>

                {/* Math Guard for Static Mode */}
                <MathGuardBadge
                  targetCalories={calories}
                  calculatedCalories={staticCalculatedCalories}
                  onAutoFix={autoFixStaticCalories}
                />
              </div>

              {/* Right: Donut Chart */}
              <div className="flex items-center justify-center">
                <MacroDonutChart
                  data={staticMacroData}
                  title="Distribuzione Macro"
                  totalCals={calories}
                />
              </div>
            </div>
          ) : (
            /* CYCLING MODE */
            <div className="space-y-6">
              {/* Smart Assistant */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    <span className="font-medium">Smart Assistant</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={applySmartCalc} className="gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    Auto-calcola Rest Days
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Media Settimanale Target
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={weeklyAvgGoal}
                        onChange={(e) => setWeeklyAvgGoal(Number(e.target.value))}
                        className="h-9"
                      />
                      <span className="text-xs text-muted-foreground">kcal</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Giorni Allenamento</Label>
                    <Select
                      value={trainingDaysPerWeek.toString()}
                      onValueChange={(v) => setTrainingDaysPerWeek(Number(v))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5, 6].map((d) => (
                          <SelectItem key={d} value={d.toString()}>
                            {d} giorni
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Media Attuale</Label>
                    <div className="h-9 flex items-center">
                      <Badge
                        variant={
                          currentWeeklyAverage &&
                          Math.abs(currentWeeklyAverage - weeklyAvgGoal) < 50
                            ? "default"
                            : "secondary"
                        }
                        className="text-sm"
                      >
                        {currentWeeklyAverage || "—"} kcal/giorno
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-column inputs + charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Training Days */}
                <div className="p-4 rounded-xl border border-orange-500/30 bg-orange-500/5">
                  <MacroInputGrid
                    targets={onDayTargets}
                    setTargets={setOnDayTargets}
                    label="Training Days"
                    calculatedCalories={onDayCalculatedCalories}
                    onAutoFix={autoFixOnDayCalories}
                  />
                  <div className="mt-4">
                    <MacroDonutChart
                      data={onDayMacroData}
                      title=""
                      totalCals={onDayTargets.calories}
                    />
                  </div>
                </div>

                {/* Rest Days */}
                <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
                  <MacroInputGrid
                    targets={offDayTargets}
                    setTargets={setOffDayTargets}
                    label="Rest Days"
                    calculatedCalories={offDayCalculatedCalories}
                    onAutoFix={autoFixOffDayCalories}
                  />
                  <div className="mt-4">
                    <MacroDonutChart
                      data={offDayMacroData}
                      title=""
                      totalCals={offDayTargets.calories}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Strategy Type & Weight Goal - Common to both modes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strategy Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Fase Goal</Label>
              <Select
                value={strategyType}
                onValueChange={(v) => setStrategyType(v as StrategyType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STRATEGY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className={cn("h-4 w-4", config.color)} />
                        <span>{config.label}</span>
                        <span className="text-xs text-muted-foreground ml-1">
                          — {config.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Weekly Weight Goal Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Variazione Peso Settimanale Target</Label>
                <Badge variant="outline" className="font-mono">
                  {weeklyWeightGoal > 0 ? "+" : ""}
                  {weeklyWeightGoal.toFixed(1)}%
                </Badge>
              </div>
              <Slider
                value={[weeklyWeightGoal]}
                onValueChange={(v) => setWeeklyWeightGoal(v[0])}
                min={-1.5}
                max={1.5}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>-1.5% (Cut)</span>
                <span>0%</span>
                <span>+1.5% (Bulk)</span>
              </div>
            </div>
          </div>

          {/* Dynamic Week Preview - Only for cycling mode */}
          {strategyMode === "cycling_on_off" && weekSchedule && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Preview Settimana</Label>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {weekSchedule.map((day, i) => {
                    const isTraining = day.hasWorkout;
                    const dayCalories = isTraining ? onDayTargets.calories : offDayTargets.calories;

                    return (
                      <div
                        key={day.date}
                        className={cn(
                          "p-2 rounded-lg text-center transition-all",
                          isTraining
                            ? "bg-orange-500/10 border border-orange-500/30"
                            : "bg-muted/50 border border-border",
                        )}
                      >
                        <p className="text-xs font-medium">{DAY_LABELS[i]}</p>
                        <div className="mt-1">
                          {isTraining ? (
                            <Dumbbell className="h-3.5 w-3.5 mx-auto text-orange-500" />
                          ) : (
                            <Coffee className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-xs mt-1 font-mono",
                            isTraining ? "text-orange-600" : "text-muted-foreground",
                          )}
                        >
                          {dayCalories}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={() => savePlanMutation.mutate()} disabled={savePlanMutation.isPending}>
              {savePlanMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva Strategia
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section A2: Nutrition adherence (read-only analytics, coabita con la prescrizione) */}
      <NutritionAdherenceCard athleteId={athleteId} />

      {/* Section B: Habit Stacking */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Habit Stacking</CardTitle>
                <CardDescription>Assegna abitudini quotidiane da tracciare</CardDescription>
              </div>
            </div>

            {/* Add Habit Dialog */}
            <Dialog open={addHabitOpen} onOpenChange={setAddHabitOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Aggiungi Habit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Aggiungi Habit</DialogTitle>
                  <DialogDescription>
                    Seleziona un habit esistente o creane uno nuovo
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Existing Habits */}
                  {availableHabits.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Dalla tua libreria</Label>
                      <div className="grid gap-2 max-h-48 overflow-y-auto">
                        {availableHabits.map((habit) => {
                          const config = CATEGORY_CONFIG[habit.category];
                          return (
                            <div
                              key={habit.id}
                              role="button"
                              tabIndex={0}
                              aria-pressed={selectedHabitId === habit.id}
                              onClick={() => setSelectedHabitId(habit.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedHabitId(habit.id);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                selectedHabitId === habit.id
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50",
                              )}
                            >
                              <config.icon className={cn("h-4 w-4", config.color)} />
                              <div className="flex-1">
                                <p className="text-sm font-medium">{habit.name}</p>
                                {habit.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {habit.description}
                                  </p>
                                )}
                              </div>
                              {selectedHabitId === habit.id && (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Create New Habit */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Oppure crea nuovo</Label>
                    <Input
                      placeholder="Nome habit (es. Creatine 5g)"
                      value={newHabitName}
                      onChange={(e) => setNewHabitName(e.target.value)}
                    />
                    <Select
                      value={newHabitCategory}
                      onValueChange={(v) => setNewHabitCategory(v as HabitCategory)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <config.icon className={cn("h-4 w-4", config.color)} />
                              {config.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Descrizione (opzionale)"
                      value={newHabitDescription}
                      onChange={(e) => setNewHabitDescription(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={!newHabitName.trim() || createHabitMutation.isPending}
                      onClick={() => createHabitMutation.mutate()}
                    >
                      {createHabitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Crea e Seleziona
                    </Button>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddHabitOpen(false)}>
                    Annulla
                  </Button>
                  <Button
                    disabled={!selectedHabitId || assignHabitMutation.isPending}
                    onClick={() => selectedHabitId && assignHabitMutation.mutate(selectedHabitId)}
                  >
                    {assignHabitMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Assegna
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {!athleteHabits || athleteHabits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Leaf className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nessun habit assegnato</p>
              <p className="text-sm mt-1">Clicca"Aggiungi Habit"per iniziare</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(Object.entries(groupedHabits) as [HabitCategory, AthleteHabit[]][]).map(
                ([category, habits]) => {
                  const config = CATEGORY_CONFIG[category];
                  return (
                    <div key={category} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <config.icon className={cn("h-4 w-4", config.color)} />
                        <span className="text-sm font-medium">{config.label}</span>
                        <Badge variant="secondary" className="text-xs">
                          {habits.length}
                        </Badge>
                      </div>
                      <div className="grid gap-2">
                        {habits.map((ah) => (
                          <div
                            key={ah.id}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg border transition-all",
                              ah.active
                                ? "border-border bg-card"
                                : "border-border/50 bg-muted/30 opacity-60",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={ah.active}
                                disabled={toggleHabitMutation.isPending}
                                onCheckedChange={(checked) =>
                                  toggleHabitMutation.mutate({
                                    habitId: ah.id,
                                    active: checked,
                                  })
                                }
                              />
                              <div>
                                <p
                                  className={cn(
                                    "text-sm font-medium",
                                    !ah.active && "line-through text-muted-foreground",
                                  )}
                                >
                                  {ah.habit?.name}
                                </p>
                                {ah.habit?.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {ah.habit.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">
                                {ah.frequency === "daily"
                                  ? "Giornaliero"
                                  : ah.frequency === "weekly"
                                    ? "Settimanale"
                                    : "Quando serve"}
                              </Badge>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Rimuovi habit"
                                    className="h-8 w-8"
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Rimuovi habit?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Questo habit verrà rimosso dall'atleta. Puoi sempre
                                      riassegnarlo in futuro.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => removeHabitMutation.mutate(ah.id)}
                                      disabled={removeHabitMutation.isPending}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Rimuovi
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
