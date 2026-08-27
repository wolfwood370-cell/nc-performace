import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  MoreHorizontal,
  Activity,
  Dumbbell,
  BarChart3,
  TrendingUp,
  Scale,
  Camera,
  Settings,
  Utensils,
  Pencil,
  Archive,
  ArchiveRestore,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Brain,
  Calendar,
  Clock,
  Zap,
  Target,
  AlertTriangle,
  Heart,
  ChevronRight,
  Play,
  Trophy,
  ChevronsUpDown,
  Check,
  Weight,
  Repeat,
  Hash,
  Plus,
  Ruler,
  CircleDot,
  Upload,
  Image,
  Grid3X3,
  Columns2,
  X as XIcon,
  User,
  Mail,
  Phone,
  Trash2,
  Save,
  Loader2,
  Shield,
  GraduationCap,
  Smartphone,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { subjectiveReadinessToScore } from "@/lib/math/readinessMath";
import {
  computeTrendSeries,
  computeWeightStats,
  deriveMeasurementCards,
  mergeWeightSources,
  type MeasurementRow,
} from "@/lib/measurements/weightTrend";
import {
  format,
  formatDistanceToNow,
  startOfWeek,
  endOfWeek,
  addDays,
  parseISO,
  isAfter,
  isBefore,
  isSameDay,
  differenceInDays,
  differenceInWeeks,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import { useAthleteAcwrData } from "@/hooks/useAthleteAcwrData";
import { AcwrGauge } from "@/components/coach/analytics/AcwrGauge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  LineChart,
  Line,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { Tooltip } from "@/components/ui/tooltip";
import { TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { StrategyContent } from "@/components/coach/athlete/StrategyContent";
import { HealthProfileTab } from "@/components/coach/athlete/HealthProfileTab";
import { PeriodizationTab } from "@/components/coach/athlete/PeriodizationTab";
import type { Tables } from "@/integrations/supabase/types";
import { isArchived, type ProfileSettings } from "@/types/profile";
import { FunctionsHttpError, type PostgrestError } from "@supabase/supabase-js";
import { log } from "@/lib/logger";

// Marks the deletion errors whose message is OUR Italian user copy: onError
// shows these verbatim and falls back to a generic Italian sentence for
// everything else (raw English server/library text must never hit the toast).
class DeleteAthleteUiError extends Error {}

/** Narrow the JSONB `settings` column to its known shape. The DB stores
 *  the blob as free-form Json — this helper centralises the cast so each
 *  reader doesn't repeat it. */
function readSettings(
  settings: Tables<"profiles">["settings"] | null | undefined,
): ProfileSettings {
  return (settings ?? {}) as ProfileSettings;
}
import {
  useAthleteExerciseList,
  useAthleteStrengthProgression,
  useAthleteVolumeIntensity,
} from "@/hooks/useAthleteAnalytics";
import { useRealtimeAnalytics } from "@/hooks/useRealtimeAnalytics";
import { VelocityTrendChart } from "@/components/coach/analytics/VelocityTrendChart";
import { BarPathGallery } from "@/components/coach/video/BarPathGallery";
import { FeatureGate } from "@/components/common/FeatureGate";
import { AiInsightCard } from "@/components/coach/analytics/AiInsightCard";
import { OverviewTab } from "./athlete-detail/OverviewTab";
import { ProgramTab } from "./athlete-detail/ProgramTab";
import { AthleteViewerDialog } from "@/components/coach/AthleteViewerDialog";

// Exercise Stats Content Component - uses REAL data from workout_exercises
function ExerciseStatsContent({ athleteId }: { athleteId: string | undefined }) {
  const { data: exerciseNames = [], isLoading: namesLoading } = useAthleteExerciseList(athleteId);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [chartView, setChartView] = useState<"1rm" | "weight" | "volume">("1rm");

  // Live realtime updates
  useRealtimeAnalytics(athleteId);

  // Auto-select first exercise when list loads
  useMemo(() => {
    if (exerciseNames.length > 0 && !selectedExercise) {
      setSelectedExercise(exerciseNames[0]);
    }
  }, [exerciseNames, selectedExercise]);

  const { data: strengthData = [], isLoading: strengthLoading } = useAthleteStrengthProgression(
    athleteId,
    selectedExercise,
  );
  const { data: volumeData = [], isLoading: volumeLoading } = useAthleteVolumeIntensity(athleteId);

  // Transform strength data for display
  const exerciseData = useMemo(() => {
    return strengthData.map((d, idx, arr) => {
      const prevMax = arr.slice(0, idx).reduce((max, p) => Math.max(max, p.estimated1RM), 0);
      return {
        date: new Date(d.date),
        dateFormatted: d.dateFormatted,
        bestWeight: d.estimated1RM, // using estimated1RM as representative weight
        rpe: 0,
        estimated1RM: d.estimated1RM,
        totalVolume: 0,
        isPR: d.estimated1RM > prevMax && prevMax > 0,
        scheme: "",
      };
    });
  }, [strengthData]);

  // KPIs
  const kpis = useMemo(() => {
    if (exerciseData.length === 0) return { estimated1RM: 0, maxVolume: 0, frequency: 0 };
    const estimated1RM = Math.max(...exerciseData.map((d) => d.estimated1RM));
    const maxVolume =
      volumeData.length > 0 ? Math.max(...volumeData.map((d) => d.totalTonnage)) : 0;
    return {
      estimated1RM: Math.round(estimated1RM),
      maxVolume,
      frequency: exerciseData.length,
    };
  }, [exerciseData, volumeData]);

  // Chart data
  const chartData = useMemo(() => {
    if (chartView === "volume") {
      return volumeData.map((d) => ({
        date: d.dateFormatted,
        value: d.totalTonnage,
        isPR: false,
      }));
    }
    return exerciseData.map((d) => ({
      date: d.dateFormatted,
      value: chartView === "1rm" ? d.estimated1RM : d.bestWeight,
      isPR: d.isPR,
    }));
  }, [exerciseData, volumeData, chartView]);

  const isLoading = namesLoading || strengthLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (exerciseNames.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-1">Nessun Dato Esercizi</h3>
        <p className="text-sm text-muted-foreground">
          Questo atleta non ha ancora completato allenamenti.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Exercise Selector Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Prestazioni Esercizio</CardTitle>
                <p className="text-sm text-muted-foreground">Progressione forza per esercizio</p>
              </div>
            </div>

            {/* Exercise Combobox */}
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="w-full sm:w-[240px] justify-between"
                >
                  <Dumbbell className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{selectedExercise || "Seleziona esercizio"}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0">
                <Command>
                  <CommandInput placeholder="Cerca esercizio..." />
                  <CommandList>
                    <CommandEmpty>Nessun esercizio trovato.</CommandEmpty>
                    <CommandGroup>
                      {exerciseNames.map((name) => (
                        <CommandItem
                          key={name}
                          value={name}
                          onSelect={(val) => {
                            setSelectedExercise(val);
                            setComboboxOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedExercise === name ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
      </Card>

      {/* Performance KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">1RM Stimato</p>
                <p className="text-3xl font-bold text-foreground">{kpis.estimated1RM} kg</p>
                <p className="text-xs text-muted-foreground mt-1">Calcolato dalla serie migliore</p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Trophy className="h-7 w-7 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Volume Max</p>
                <p className="text-3xl font-bold text-foreground">
                  {kpis.maxVolume.toLocaleString()} kg
                </p>
                <p className="text-xs text-muted-foreground mt-1">Sessione singola più alta</p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-chart-volume/10 flex items-center justify-center">
                <Weight className="h-7 w-7 text-chart-volume" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Frequenza</p>
                <p className="text-3xl font-bold text-foreground">{kpis.frequency}x</p>
                <p className="text-xs text-muted-foreground mt-1">Sessioni con questo esercizio</p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-chart-frequency/10 flex items-center justify-center">
                <Repeat className="h-7 w-7 text-chart-frequency" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Chart */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-base">Progressione nel Tempo</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={chartView === "1rm" ? "default" : "outline"}
                size="sm"
                onClick={() => setChartView("1rm")}
                className="text-xs"
              >
                1RM Stimato
              </Button>
              <Button
                variant={chartView === "weight" ? "default" : "outline"}
                size="sm"
                onClick={() => setChartView("weight")}
                className="text-xs"
              >
                Carico Max
              </Button>
              <Button
                variant={chartView === "volume" ? "default" : "outline"}
                size="sm"
                onClick={() => setChartView("volume")}
                className="text-xs"
              >
                Volume
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nessun dato per questo esercizio</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      chartView === "volume" ? `${(value / 1000).toFixed(1)}k` : `${value}`
                    }
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                          <p className="text-sm font-medium text-foreground">{data.date}</p>
                          <p className="text-sm text-muted-foreground">
                            {chartView === "1rm"
                              ? "1RM Stimato"
                              : chartView === "weight"
                                ? "Carico Max"
                                : "Volume"}
                            :
                            <span className="font-semibold text-foreground ml-1">
                              {chartView === "volume"
                                ? `${data.value.toLocaleString()} kg`
                                : `${data.value} kg`}
                            </span>
                          </p>
                          {data.isPR && (
                            <Badge
                              variant="default"
                              className="mt-1 text-xs bg-amber-500/20 text-amber-500 border-amber-500/30"
                            >
                              <Trophy className="h-3 w-3 mr-1" /> PR!
                            </Badge>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (payload.isPR) {
                        return (
                          <g key={`dot-${cx}-${cy}`}>
                            <circle cx={cx} cy={cy} r={6} fill="hsl(var(--primary))" />
                            <circle cx={cx} cy={cy} r={3} fill="hsl(var(--primary-foreground))" />
                          </g>
                        );
                      }
                      return (
                        <circle
                          key={`dot-${cx}-${cy}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="hsl(var(--primary))"
                        />
                      );
                    }}
                    activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Advanced Stats Content — the load lens, and nothing invented (C-09).
// The old "Monitor Sicurezza" rendered Math.random() series (mock daily
// loads, mock ACWR trend, monotony/strain over fake data) with risk
// verdicts on top. Where the source is fake, the surface now shows the
// honest state instead: the single ACWR module result — same hook, same
// module, same outcome as the Overview tab — or its absence with the
// reason. The real load history will exist when the product collects the
// session RPE in its own column.
function AdvancedStatsContent({ athleteId }: { athleteId: string | undefined }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Carico di allenamento</CardTitle>
              <p className="text-sm text-muted-foreground">
                Carico interno sRPE × durata (Foster) — il rapporto recente/abituale è una lente
                descrittiva
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <AcwrGauge athleteId={athleteId} />
    </div>
  );
}

// Mini sparkline component for measurements
function MiniSparkline({
  data,
  color = "hsl(var(--primary))",
}: {
  data: Array<{ value: number }>;
  color?: string;
}) {
  // A single point cannot draw a line (and would divide by zero below).
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 80 - 10; // 10-90% range
      return `${x},${y}`;
    })
    .join("");

  return (
    <svg viewBox="0 0 100 40" className="w-full h-10 overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={100}
        cy={100 - ((values[values.length - 1] - min) / range) * 80 - 10}
        r="3"
        fill={color}
      />
    </svg>
  );
}

// Body Metrics Content Component
function BodyMetricsContent({ athleteId }: { athleteId: string | undefined }) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newMetric, setNewMetric] = useState({
    weight: "",
    waist: "",
    chest: "",
    thigh: "",
    arm: "",
  });

  // INSERT a `body_measurements` row from the dialog form. Only fields the
  // coach actually filled in get persisted — empty strings collapse to
  // `null`. After success the dialog closes and both weight readers (this
  // tab and the Overview trend) are invalidated so the charts refresh.
  const addMeasurementMutation = useMutation({
    mutationFn: async (input: typeof newMetric) => {
      if (!athleteId) throw new Error("Atleta non selezionato.");
      const toNumberOrNull = (v: string) => {
        const trimmed = v.trim();
        if (!trimmed) return null;
        const n = Number(trimmed);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const payload = {
        athlete_id: athleteId,
        date: format(new Date(), "yyyy-MM-dd"),
        weight_kg: toNumberOrNull(input.weight),
        waist_cm: toNumberOrNull(input.waist),
        chest_cm: toNumberOrNull(input.chest),
        thigh_cm: toNumberOrNull(input.thigh),
        arm_cm: toNumberOrNull(input.arm),
      };
      // Reject empty submissions — at least one measurement must be filled.
      if (
        payload.weight_kg === null &&
        payload.waist_cm === null &&
        payload.chest_cm === null &&
        payload.thigh_cm === null &&
        payload.arm_cm === null
      ) {
        throw new Error("Inserisci almeno una misurazione.");
      }
      const { error } = await supabase.from("body_measurements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["body-measurements", athleteId],
      });
      queryClient.invalidateQueries({
        queryKey: ["athlete-weight-trend", athleteId],
      });
      toast.success("Misurazioni registrate");
      setIsAddDialogOpen(false);
      setNewMetric({ weight: "", waist: "", chest: "", thigh: "", arm: "" });
    },
    onError: (error: Error) => {
      toast.error("Salvataggio fallito", { description: error.message });
    },
  });

  // Coach-entered measurements — same query key the mutation above
  // invalidates on success, so a new insert refreshes this tab.
  const {
    data: measurementRows = [],
    isSuccess: measurementsLoaded,
    isError: measurementsError,
    fetchStatus: measurementsFetchStatus,
  } = useQuery({
    queryKey: ["body-measurements", athleteId],
    queryFn: async (): Promise<MeasurementRow[]> => {
      if (!athleteId) return [];
      const { data, error } = await supabase
        .from("body_measurements")
        .select("date, weight_kg, waist_cm, chest_cm, thigh_cm, arm_cm")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000,
  });

  // Weight series for this tab reads body_measurements only — the merged
  // two-source view lives in the Overview card.
  const trendSeries = useMemo(
    () => computeTrendSeries(mergeWeightSources([], measurementRows)),
    [measurementRows],
  );

  const weightStats = useMemo(() => computeWeightStats(trendSeries), [trendSeries]);

  // Last 30 measurements, not last 30 days: with sparse data a day-window
  // could blank a chart that has history.
  const chartData = useMemo(
    () =>
      trendSeries.slice(-30).map((point) => ({
        date: format(parseISO(point.date), "MMM d"),
        weight: point.weight_kg,
        trend: point.trend,
      })),
    [trendSeries],
  );

  const measurements = useMemo(() => deriveMeasurementCards(measurementRows), [measurementRows]);

  // Waist clause of the weekly summary: same honesty rule as the weight —
  // a change compared across more than 30 days is not narrated.
  const waistCard = measurements.find((m) => m.key === "waist");
  const waistChange =
    waistCard != null &&
    waistCard.weeklyChange !== null &&
    waistCard.lastGapDays !== null &&
    waistCard.lastGapDays <= 30
      ? waistCard.weeklyChange
      : null;

  const handleAddMetric = () => {
    addMeasurementMutation.mutate(newMetric);
  };

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Scale className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Composizione Corporea</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Trend peso e misurazioni circonferenze
                </p>
              </div>
            </div>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Registra Misurazione
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Registra Nuove Misurazioni</DialogTitle>
                  <DialogDescription>
                    Inserisci le misurazioni corporee di oggi per l'atleta.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weight">Peso (kg)</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.1"
                        placeholder="82.5"
                        value={newMetric.weight}
                        onChange={(e) =>
                          setNewMetric((prev) => ({
                            ...prev,
                            weight: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="waist">Vita (cm)</Label>
                      <Input
                        id="waist"
                        type="number"
                        step="0.1"
                        placeholder="84.0"
                        value={newMetric.waist}
                        onChange={(e) =>
                          setNewMetric((prev) => ({
                            ...prev,
                            waist: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="chest">Petto (cm)</Label>
                      <Input
                        id="chest"
                        type="number"
                        step="0.1"
                        placeholder="104.0"
                        value={newMetric.chest}
                        onChange={(e) =>
                          setNewMetric((prev) => ({
                            ...prev,
                            chest: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="thigh">Coscia (cm)</Label>
                      <Input
                        id="thigh"
                        type="number"
                        step="0.1"
                        placeholder="58.0"
                        value={newMetric.thigh}
                        onChange={(e) =>
                          setNewMetric((prev) => ({
                            ...prev,
                            thigh: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="arm">Braccio (cm)</Label>
                      <Input
                        id="arm"
                        type="number"
                        step="0.1"
                        placeholder="38.0"
                        value={newMetric.arm}
                        onChange={(e) =>
                          setNewMetric((prev) => ({
                            ...prev,
                            arm: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Annulla
                  </Button>
                  <Button onClick={handleAddMetric} disabled={addMeasurementMutation.isPending}>
                    {addMeasurementMutation.isPending ? "Salvataggio…" : "Salva Misurazioni"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weight Analysis Section (Left - 2 columns) */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Analisi Trend Peso
              </CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Informazioni"
                      className="h-8 w-8"
                    >
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[280px]">
                    <p className="text-sm">
                      <strong>Media Mobile 7 Giorni</strong>
                      <br />
                      La linea continua mostra il trend reale del peso, eliminando le fluttuazioni
                      giornaliere da ritenzione idrica, timing dei pasti, ecc.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            {/* Data first: rows already loaded keep rendering through a
                failed background refetch; emptiness is asserted only on a
                settled fresh answer, never while fetching or paused. */}
            {trendSeries.length > 0 ? (
              <>
                {/* Stats Row */}
                <div className="flex items-center gap-6 mb-4 pb-4 border-b border-border/50">
                  <div>
                    <p className="text-sm text-muted-foreground">Trend Attuale</p>
                    <p className="text-2xl font-bold text-foreground">
                      {weightStats.currentTrend?.toFixed(1)} kg
                    </p>
                  </div>
                  <div className="h-10 w-px bg-border" />
                  <div>
                    <p className="text-sm text-muted-foreground">Variazione Settimanale</p>
                    {weightStats.weeklyChange === null ? (
                      <p className="text-2xl font-bold text-muted-foreground">—</p>
                    ) : (
                      <p
                        className={cn(
                          "text-2xl font-bold",
                          weightStats.weeklyChange < 0
                            ? "text-green-500"
                            : weightStats.weeklyChange > 0
                              ? "text-amber-500"
                              : "text-muted-foreground",
                        )}
                      >
                        {weightStats.weeklyChange > 0 ? "+" : ""}
                        {weightStats.weeklyChange.toFixed(1)} kg
                      </p>
                    )}
                  </div>
                </div>

                {/* Chart */}
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        domain={["dataMin - 1", "dataMax + 1"]}
                        tickFormatter={(value) => `${value}kg`}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                              <p className="text-sm font-medium text-foreground">{data.date}</p>
                              <div className="space-y-1 mt-1">
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                  <CircleDot className="h-3 w-3 text-muted-foreground/50" />
                                  Effettivo:{" "}
                                  <span className="font-semibold text-foreground">
                                    {data.weight} kg
                                  </span>
                                </p>
                                {data.trend && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                                    <div className="w-3 h-0.5 bg-primary rounded" />
                                    Trend:{" "}
                                    <span className="font-semibold text-primary">
                                      {data.trend} kg
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        }}
                      />
                      {/* Raw weight as dots — bigger when few real points,
                          or they would be nearly invisible. */}
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={0}
                        dot={{
                          fill: "hsl(var(--muted-foreground))",
                          r: chartData.length <= 5 ? 4 : 2,
                          opacity: chartData.length <= 5 ? 0.8 : 0.4,
                        }}
                        activeDot={{ r: 4, fill: "hsl(var(--foreground))" }}
                      />
                      {/* Trend line (7-day MA). A single point draws no
                          segment, so it gets a visible dot instead. */}
                      <Line
                        type="monotone"
                        dataKey="trend"
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        dot={chartData.length === 1 ? { r: 5, fill: "hsl(var(--primary))" } : false}
                        activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <CircleDot className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground">Peso Giornaliero</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-primary rounded" />
                    <span className="text-xs text-muted-foreground">Trend 7 Giorni</span>
                  </div>
                </div>
              </>
            ) : measurementRows.length > 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm font-medium text-foreground">Nessun peso registrato</p>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  Le misurazioni salvate finora non includono il peso: usa «Registra Misurazione»
                  qui sopra e il grafico comparirà qui.
                </p>
              </div>
            ) : measurementsError ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Errore nel caricamento delle misurazioni.
              </div>
            ) : measurementsLoaded && measurementsFetchStatus === "idle" ? (
              <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm font-medium text-foreground">
                  Nessuna misurazione registrata
                </p>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  Usa «Registra Misurazione» qui sopra per salvare la prima: peso e trend
                  compariranno qui.
                </p>
              </div>
            ) : (
              <Skeleton className="h-[280px] w-full" />
            )}
          </CardContent>
        </Card>

        {/* Body Measurements Grid (Right - 1 column) */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            Misurazioni Corporee
          </h3>

          {/* Same data-first order as the weight card: loaded rows keep
              rendering through a failed refetch; emptiness only settles
              on a fresh idle answer. */}
          {measurementRows.length > 0 ? (
            measurements.map((measurement) => (
              <Card key={measurement.key} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{measurement.label}</span>
                    {measurement.weeklyChange !== null && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          measurement.weeklyChange < 0 && measurement.key === "waist"
                            ? "text-green-500 border-green-500/30"
                            : measurement.weeklyChange > 0 && measurement.key !== "waist"
                              ? "text-green-500 border-green-500/30"
                              : measurement.weeklyChange !== 0
                                ? "text-amber-500 border-amber-500/30"
                                : "",
                        )}
                      >
                        {measurement.weeklyChange > 0 ? "+" : ""}
                        {measurement.weeklyChange} {measurement.unit}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {measurement.latestValue ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{measurement.unit}</p>
                    </div>

                    <div className="flex-1 max-w-[80px]">
                      <MiniSparkline
                        data={measurement.history}
                        color={
                          measurement.key === "waist"
                            ? "hsl(var(--success))"
                            : "hsl(var(--primary))"
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : measurementsError ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Errore nel caricamento delle misurazioni.
              </CardContent>
            </Card>
          ) : measurementsLoaded && measurementsFetchStatus === "idle" ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Nessuna circonferenza registrata: le card si riempiono con «Registra Misurazione».
              </CardContent>
            </Card>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}

          {/* Quick Summary Card — only written when a weekly change was
              actually measured (two weight points, 7-30 days apart); the
              waist clause additionally needs its own gap within 30 days.
              Directions are stated as measured — an increase is named an
              increase, and the verdict only exists where it is true. */}
          {weightStats.weeklyChange !== null && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Riepilogo Settimanale</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Peso in{" "}
                  {weightStats.weeklyChange < 0
                    ? "calo"
                    : weightStats.weeklyChange > 0
                      ? "aumento"
                      : "mantenimento"}
                  {waistChange !== null &&
                    `, vita ${
                      waistChange < 0
                        ? "in diminuzione"
                        : waistChange > 0
                          ? "in aumento"
                          : "stabile"
                    }`}
                  .
                  {weightStats.weeklyChange < 0 &&
                    waistChange !== null &&
                    waistChange < 0 &&
                    " Buoni progressi nella fase di taglio!"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Mock progress photos data
const generateMockProgressPhotos = () => {
  const poses = ["front", "side", "back"] as const;
  const dates = [
    new Date(2025, 0, 12), // Jan 12
    new Date(2025, 0, 5), // Jan 5
    new Date(2024, 11, 29), // Dec 29
    new Date(2024, 11, 22), // Dec 22
    new Date(2024, 11, 15), // Dec 15
  ];

  return dates.map((date) => ({
    date,
    dateLabel: format(date, "MMM d, yyyy"),
    photos: poses.map((pose) => ({
      id: `${format(date, "yyyy-MM-dd")}-${pose}`,
      pose,
      // Using placeholder.svg as mock image
      url: "/placeholder.svg",
    })),
  }));
};

// Progress Pics Content Component
function ProgressPicsContent({ athleteId }: { athleteId: string | undefined }) {
  const [compareMode, setCompareMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedPose, setSelectedPose] = useState<"front" | "side" | "back">("front");

  // Mock data
  const progressData = useMemo(() => generateMockProgressPhotos(), []);

  // Handle date selection for comparison
  const handleDateSelect = (dateLabel: string) => {
    if (!compareMode) return;

    setSelectedDates((prev) => {
      if (prev.includes(dateLabel)) {
        return prev.filter((d) => d !== dateLabel);
      }
      if (prev.length >= 2) {
        return [prev[1], dateLabel];
      }
      return [...prev, dateLabel];
    });
  };

  // Get photos for comparison
  const comparisonPhotos = useMemo(() => {
    if (selectedDates.length !== 2) return null;

    const [date1, date2] = selectedDates;
    const session1 = progressData.find((s) => s.dateLabel === date1);
    const session2 = progressData.find((s) => s.dateLabel === date2);

    if (!session1 || !session2) return null;

    return {
      before: {
        date: session1.dateLabel,
        photo: session1.photos.find((p) => p.pose === selectedPose),
      },
      after: {
        date: session2.dateLabel,
        photo: session2.photos.find((p) => p.pose === selectedPose),
      },
    };
  }, [selectedDates, selectedPose, progressData]);

  const poseLabels = {
    front: "Front",
    side: "Side",
    back: "Back",
  };

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Foto Progresso</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Monitoraggio visivo della trasformazione
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Compare Mode Toggle */}
              <div className="flex items-center gap-2">
                <Columns2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Confronta</span>
                <Switch
                  checked={compareMode}
                  onCheckedChange={(checked) => {
                    setCompareMode(checked);
                    if (!checked) setSelectedDates([]);
                  }}
                />
              </div>

              {/* Upload Button */}
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Carica Foto Check-in
              </Button>
            </div>
          </div>

          {/* Compare Mode Instructions */}
          {compareMode && (
            <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm text-foreground">
                <strong>Modalità Confronto Attiva:</strong> Seleziona due date sotto per confrontare
                i progressi affiancati.
                {selectedDates.length === 1 && "(1/2 selezionata)"}
                {selectedDates.length === 2 && "(2/2 selezionate - visualizzazione confronto)"}
              </p>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Comparison View */}
      {compareMode && selectedDates.length === 2 && comparisonPhotos && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Columns2 className="h-5 w-5 text-primary" />
                Confronto Affiancato
              </CardTitle>

              {/* Pose Selector */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(["front", "side", "back"] as const).map((pose) => (
                  <Button
                    key={pose}
                    variant={selectedPose === pose ? "default" : "ghost"}
                    size="sm"
                    className="text-xs px-3"
                    onClick={() => setSelectedPose(pose)}
                  >
                    {poseLabels[pose]}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {/* Before */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    Prima
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {comparisonPhotos.before.date}
                  </span>
                </div>
                <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden relative">
                  {comparisonPhotos.before.photo ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <User className="h-24 w-24 text-muted-foreground/30" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <Badge className="absolute bottom-2 left-2 capitalize">{selectedPose}</Badge>
                </div>
              </div>

              {/* After */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="text-xs bg-green-500 hover:bg-green-600">
                    Dopo
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {comparisonPhotos.after.date}
                  </span>
                </div>
                <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden relative">
                  {comparisonPhotos.after.photo ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <User className="h-24 w-24 text-muted-foreground/30" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <Badge className="absolute bottom-2 left-2 capitalize">{selectedPose}</Badge>
                </div>
              </div>
            </div>

            {/* Clear Selection */}
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setSelectedDates([])}
              >
                <XIcon className="h-4 w-4" />
                Cancella Selezione
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gallery Grid by Date */}
      <div className="space-y-6">
        {progressData.map((session) => (
          <Card
            key={session.dateLabel}
            className={cn(
              "overflow-hidden transition-all cursor-pointer",
              compareMode && "hover:ring-2 hover:ring-primary/50",
              compareMode && selectedDates.includes(session.dateLabel) && "ring-2 ring-primary",
            )}
            onClick={() => handleDateSelect(session.dateLabel)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{session.dateLabel}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(session.date, { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {compareMode && (
                  <div
                    className={cn(
                      "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors",
                      selectedDates.includes(session.dateLabel)
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {selectedDates.includes(session.dateLabel) && (
                      <Check className="h-4 w-4 text-primary-foreground" />
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {session.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden group"
                  >
                    {/* Placeholder Photo */}
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <User className="h-12 w-12 text-muted-foreground/30" />
                    </div>

                    {/* Pose Badge */}
                    <Badge
                      variant="secondary"
                      className="absolute bottom-2 left-2 text-xs capitalize"
                    >
                      {photo.pose}
                    </Badge>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="secondary" size="sm" className="gap-1">
                          <Grid3X3 className="h-3 w-3" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State (if no photos) */}
      {progressData.length === 0 && (
        <Card className="p-12 text-center">
          <Camera className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nessuna Foto Progresso</h3>
          <p className="text-muted-foreground mb-4">
            Carica foto check-in per monitorare il progresso visivo nel tempo.
          </p>
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Carica Prime Foto
          </Button>
        </Card>
      )}
    </div>
  );
}

// Training status options
const TRAINING_STATUS_OPTIONS = [
  {
    value: "active",
    label: "Attivo",
    color: "bg-success text-success-foreground",
  },
  {
    value: "injured",
    label: "Infortunato",
    color: "bg-destructive text-destructive-foreground",
  },
  {
    value: "on_hold",
    label: "In Pausa",
    color: "bg-warning text-warning-foreground",
  },
];

// Experience level options
const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzato" },
  { value: "elite", label: "Elite" },
];

// Neurotype options
const NEUROTYPE_OPTIONS = [
  {
    value: "1A",
    label: "Tipo 1A",
    description: "Dominante dopamina - Cercatore di novità",
  },
  {
    value: "1B",
    label: "Tipo 1B",
    description: "Dominante dopamina - Cercatore di emozioni",
  },
  {
    value: "2A",
    label: "Tipo 2A",
    description: "Dominante adrenalina - Flessibile",
  },
  {
    value: "2B",
    label: "Tipo 2B",
    description: "Dominante adrenalina - Orientato alla ricompensa",
  },
  {
    value: "3",
    label: "Tipo 3",
    description: "Dominante serotonina - Focalizzato sulla costanza",
  },
];

// Settings Content Component
function SettingsContent({
  athleteId,
  profile,
  onProfileUpdate,
  archiveDialogOpen,
  onArchiveDialogOpenChange,
}: {
  athleteId: string | undefined;
  profile: Tables<"profiles"> | null | undefined;
  onProfileUpdate: () => void;
  /** Lifted dialog state: the header «⋯» menu opens the canonical dialog. */
  archiveDialogOpen: boolean;
  onArchiveDialogOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state — initialised from the typed `settings` blob with the
  // `readSettings` helper so we never have to do `as any` casts here.
  const settings = readSettings(profile?.settings);
  const archived = isArchived(profile?.settings);
  const [neurotype, setNeurotype] = useState(profile?.neurotype || "");
  const [trainingStatus, setTrainingStatus] = useState<string>(
    settings.training_status ?? "active",
  );
  const [experienceLevel, setExperienceLevel] = useState<string>(
    settings.experience_level ?? "intermediate",
  );
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [coachNotes, setCoachNotes] = useState(settings.coach_notes ?? "");

  // Re-sync local form state when `profile` is refetched (e.g. after the
  // save mutation invalidates the cache). Without this, useState's
  // initialiser only fires on first mount so the form keeps the stale
  // values after a successful save — the user sees the old data until
  // a manual refresh. Each setter is a primitive so equality is cheap.
  // We deliberately key on the specific fields (not the whole profile
  // object) so unrelated profile updates don't reset the form mid-edit.
  useEffect(() => {
    setNeurotype(profile?.neurotype || "");
    setFullName(profile?.full_name || "");
    setTrainingStatus(settings.training_status ?? "active");
    setExperienceLevel(settings.experience_level ?? "intermediate");
    setCoachNotes(settings.coach_notes ?? "");
    // `settings` is derived from profile?.settings on every render but is
    // a fresh object reference each time — depend on the source fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.neurotype, profile?.full_name, profile?.settings]);

  // Get status badge config
  const getStatusConfig = (status: string) => {
    return TRAINING_STATUS_OPTIONS.find((s) => s.value === status) || TRAINING_STATUS_OPTIONS[0];
  };

  // Save profile mutation
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("No athlete ID");

      // Merge the form values onto the existing JSONB blob via the
      // typed reader so we don't clobber other keys (e.g. archived flags).
      const updatedSettings: ProfileSettings = {
        ...readSettings(profile?.settings),
        training_status: trainingStatus as ProfileSettings["training_status"],
        experience_level: experienceLevel as ProfileSettings["experience_level"],
        coach_notes: coachNotes,
      };

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          neurotype: neurotype || null,
          // ProfileSettings is a named-key shape and Json wants an index
          // signature — the bridge cast is unavoidable until we add
          // `[key: string]: Json` to the interface.
          settings: updatedSettings as unknown as Tables<"profiles">["settings"],
          updated_at: new Date().toISOString(),
        })
        .eq("id", athleteId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profilo salvato con successo");
      queryClient.invalidateQueries({
        queryKey: ["athlete-profile", athleteId],
      });
      onProfileUpdate();
    },
    onError: (error: Error | PostgrestError) => {
      toast.error(`Errore nel salvataggio: ${error.message}`);
    },
  });

  // Permanent delete mutation. The edge function fails CLOSED with stable error
  // codes in the non-2xx body; supabase-js wraps non-2xx in a FunctionsHttpError
  // whose message is a generic English sentence, so the body is read from
  // error.context (same pattern as InviteAthleteDialog.invokeErrorToMessage).
  const deleteAthleteMutation = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("No athlete ID");
      const { data, error } = await supabase.functions.invoke("delete-athlete", {
        body: { athlete_id: athleteId },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          let body: { error?: string; profileDeleted?: boolean } | null = null;
          try {
            body = await error.context.json();
          } catch {
            body = null; // non-JSON body: fall through to the generic error below
          }
          // Profile gone but login user left behind: the deletion DID happen, so
          // this is a success-with-warning — the UI must clean up and navigate,
          // not leave the coach on a page for an athlete that no longer exists.
          if (body?.error === "auth_user_deletion_failed" && body.profileDeleted) {
            return { authUserDeletionFailed: true };
          }
          if (body?.error === "stripe_cancel_failed") {
            throw new DeleteAthleteUiError(
              "Disdetta dell'abbonamento Stripe non riuscita: nessun dato è stato cancellato. Riprova.",
            );
          }
          if (body?.error === "stripe_events_scrub_failed") {
            throw new DeleteAthleteUiError(
              "Pulizia del registro pagamenti non riuscita: nessun dato è stato cancellato. Riprova.",
            );
          }
        }
        // Unmapped code, non-JSON body, network failure: onError shows the
        // generic Italian copy — raw English server/library text never reaches
        // the toast (spec: stringhe-utente in italiano).
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return { authUserDeletionFailed: false };
    },
    onSuccess: async ({ authUserDeletionFailed }) => {
      if (authUserDeletionFailed) {
        toast.warning(
          "Profilo eliminato, ma l'utenza di accesso non è stata rimossa: da segnalare.",
        );
      } else {
        toast.success("Atleta eliminato definitivamente");
      }
      // Remove every cached query that references this athlete (roster, risk overview,
      // live sessions, scheduled workouts, readiness, etc.) so nothing stale lingers in the UI.
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key)) return false;
          return key.some((part) => {
            if (typeof part === "string" && athleteId && part.includes(athleteId)) return true;
            if (part && typeof part === "object") {
              try {
                return JSON.stringify(part).includes(athleteId ?? "");
              } catch {
                return false;
              }
            }
            return false;
          });
        },
      });
      // Invalidate the coach-wide rosters / overviews so the deleted athlete disappears.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["risk-overview-athletes"] }),
        queryClient.invalidateQueries({ queryKey: ["risk-overview-logs"] }),
        queryClient.invalidateQueries({ queryKey: ["risk-overview-metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["risk-overview-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["live-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["coach-athletes"] }),
        queryClient.invalidateQueries({ queryKey: ["coach-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["coach-workout-logs"] }),
        queryClient.invalidateQueries({ queryKey: ["coach-injuries"] }),
        queryClient.invalidateQueries({ queryKey: ["coach-calendar"] }),
        queryClient.invalidateQueries({ queryKey: ["coach-programs"] }),
        queryClient.invalidateQueries({ queryKey: ["scheduled-workouts"] }),
      ]);
      navigate("/coach/athletes");
    },
    onError: (error: unknown) => {
      // Only OUR Italian copy reaches the coach; every other failure (unmapped
      // code, network, non-JSON body) gets the generic fallback. The raw error
      // stays available for diagnostics via the logger.
      log.error("delete-athlete failed", error);
      toast.error(
        error instanceof DeleteAthleteUiError
          ? error.message
          : "Errore nell'eliminazione: l'atleta NON è stato eliminato. Riprova.",
      );
    },
  });

  // Archive athlete mutation — delegates to the server-side RPC
  // `archive_athlete` (C8 audit fix). The RPC enforces coach ownership
  // server-side and performs the JSONB patch atomically with jsonb_set,
  // eliminating the read-modify-write race that the previous inline
  // update suffered from when two tabs archived concurrently.
  const archiveAthleteMutation = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("No athlete ID");

      const { error } = await supabase.rpc("archive_athlete", {
        p_athlete_id: athleteId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atleta archiviato con successo");
      // Refresh every list that filters on settings.archived so the athlete
      // drops out of the active roster without a manual reload.
      queryClient.invalidateQueries({ queryKey: ["athlete-profile", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["risk-overview-athletes"] });
      queryClient.invalidateQueries({ queryKey: ["coach-athletes"] });
      navigate("/coach/athletes");
    },
    onError: (error: Error | PostgrestError) => {
      toast.error(`Errore nell'archiviazione: ${error.message}`);
    },
  });

  // Restore mutation — same RPC family as archive. Deliberately no dialog:
  // restoring is non-destructive (the RPC just removes the archived keys).
  const unarchiveAthleteMutation = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("No athlete ID");

      const { error } = await supabase.rpc("unarchive_athlete", {
        p_athlete_id: athleteId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atleta ripristinato");
      queryClient.invalidateQueries({ queryKey: ["athlete-profile", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["risk-overview-athletes"] });
      queryClient.invalidateQueries({ queryKey: ["coach-athletes"] });
    },
    onError: (error: Error | PostgrestError) => {
      toast.error(`Errore nel ripristino: ${error.message}`);
    },
  });

  const handleSave = () => {
    // Loading state is sourced from `saveProfileMutation.isPending`
    // directly (see the button below). The previous local `isSaving`
    // flag was set true → mutate() → set false synchronously, which
    // turned the spinner off before the mutation even completed.
    saveProfileMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Card 1: Coaching Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Parametri Prestazione</CardTitle>
              <CardDescription>
                Configura algoritmi di allenamento e classificazione atleta
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Neurotype */}
          <div className="grid gap-2">
            <Label htmlFor="neurotype" className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              Neurotype
            </Label>
            <Select value={neurotype} onValueChange={setNeurotype}>
              <SelectTrigger id="neurotype" className="w-full">
                <SelectValue placeholder="Seleziona neurotipo" />
              </SelectTrigger>
              <SelectContent>
                {NEUROTYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Influenza volume, intensità e raccomandazioni di recupero
            </p>
          </div>

          {/* Training Status */}
          <div className="grid gap-2">
            <Label htmlFor="training-status" className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Stato Allenamento
            </Label>
            <div className="flex items-center gap-3">
              <Select value={trainingStatus} onValueChange={setTrainingStatus}>
                <SelectTrigger id="training-status" className="w-full">
                  <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge className={cn("shrink-0", getStatusConfig(trainingStatus).color)}>
                {getStatusConfig(trainingStatus).label}
              </Badge>
            </div>
          </div>

          {/* Experience Level */}
          <div className="grid gap-2">
            <Label htmlFor="experience" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              Livello Esperienza
            </Label>
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger id="experience" className="w-full">
                <SelectValue placeholder="Seleziona livello" />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_LEVELS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Personal Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Informazioni Profilo</CardTitle>
              <CardDescription>Dettagli personali e informazioni di contatto</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="text-xl bg-muted">
                {profile?.full_name
                  ?.split("")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button variant="outline" size="sm" disabled>
                <Camera className="h-4 w-4 mr-2" />
                Cambia Foto
              </Button>
              <p className="text-xs text-muted-foreground">Caricamento foto in arrivo</p>
            </div>
          </div>

          {/* Full Name */}
          <div className="grid gap-2">
            <Label htmlFor="full-name" className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Nome Completo
            </Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Inserisci nome completo"
            />
          </div>

          {/* Email (read-only) */}
          <div className="grid gap-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email
            </Label>
            <Input
              id="email"
              value={athleteId || ""}
              disabled
              className="bg-muted/50 text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              L'email di accesso non può essere modificata dal coach
            </p>
          </div>

          {/* Coach Notes */}
          <div className="grid gap-2">
            <Label htmlFor="coach-notes" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Note Private del Coach
            </Label>
            <Textarea
              id="coach-notes"
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              placeholder="Telefono, contatto di emergenza, preferenze di allenamento, ecc."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Visibili solo a te. Usa per note personali e informazioni di contatto.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saveProfileMutation.isPending}
          className="min-w-[140px]"
        >
          {saveProfileMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvataggio...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salva Modifiche
            </>
          )}
        </Button>
      </div>

      {/* Card 3: Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-lg text-destructive">Zona Pericolosa</CardTitle>
              <CardDescription>Azioni irreversibili per questo atleta</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Archive / Restore athlete — conditional on the archived flag */}
          {archived ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
              <div>
                <h4 className="font-medium text-foreground">Ripristina Atleta</h4>
                <p className="text-sm text-muted-foreground">
                  Riporta l'atleta nel roster attivo; tutti i dati restano intatti
                </p>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => unarchiveAthleteMutation.mutate()}
                disabled={unarchiveAthleteMutation.isPending}
              >
                <ArchiveRestore className="h-4 w-4 mr-2" />
                {unarchiveAthleteMutation.isPending ? "Ripristino..." : "Ripristina"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
              <div>
                <h4 className="font-medium text-foreground">Archivia Atleta</h4>
                <p className="text-sm text-muted-foreground">
                  Nascondi dal roster attivo ma conserva tutti i dati
                </p>
              </div>
              <AlertDialog open={archiveDialogOpen} onOpenChange={onArchiveDialogOpenChange}>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary" className="shrink-0">
                    <Archive className="h-4 w-4 mr-2" />
                    Archivia
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archiviare questo atleta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Questo nasconderà {profile?.full_name || "questo atleta"} dal roster attivo.
                      Tutti i dati di allenamento saranno conservati e potranno essere ripristinati.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => archiveAthleteMutation.mutate()}
                      disabled={archiveAthleteMutation.isPending}
                    >
                      {archiveAthleteMutation.isPending ? "Archiviazione..." : "Archivia Atleta"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Delete Athlete */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div>
              <h4 className="font-medium text-destructive">Elimina Atleta</h4>
              <p className="text-sm text-muted-foreground">
                Rimuovi definitivamente atleta e tutti i log di allenamento
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive">
                    Eliminare definitivamente questo atleta?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Questa azione non può essere annullata. Eliminerà permanentemente
                    {profile?.full_name
                      ? `il profilo di ${profile.full_name}`
                      : "il profilo dell'atleta"}
                    , tutti i log di allenamento, metriche e storico.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteAthleteMutation.mutate()}
                    disabled={deleteAthleteMutation.isPending}
                  >
                    {deleteAthleteMutation.isPending
                      ? "Eliminazione..."
                      : "Elimina Definitivamente"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AthleteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [godModeOpen, setGodModeOpen] = useState(false);
  // Lifted so the header «⋯» menu can open the canonical archive dialog,
  // which lives inside the Settings tab (unmounted while other tabs show).
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  // Fetch athlete profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["athlete-profile", id],
    queryFn: async () => {
      if (!id) throw new Error("No athlete ID");
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch active injuries
  const { data: injuries } = useQuery({
    queryKey: ["athlete-injuries", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("injuries")
        .select("*")
        .eq("athlete_id", id)
        .neq("status", "healed")
        .order("injury_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch current training phase
  const { data: currentPhase } = useQuery({
    queryKey: ["athlete-current-phase", id],
    queryFn: async () => {
      if (!id) return null;
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("training_phases")
        .select("*")
        .eq("athlete_id", id)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch latest workout for "Last Active"
  const { data: latestWorkout } = useQuery({
    queryKey: ["athlete-latest-workout", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("workout_logs")
        .select("completed_at")
        .eq("athlete_id", id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch today's readiness (daily_metrics)
  const { data: todayMetrics } = useQuery({
    queryKey: ["athlete-today-metrics", id],
    queryFn: async () => {
      if (!id) return null;
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("user_id", id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch weight trend (30 days) — union of the athlete's self-weighs
  // (daily_metrics) and the coach's instrument measurements
  // (body_measurements); on date collision the measurement wins.
  const { data: weightTrend } = useQuery({
    queryKey: ["athlete-weight-trend", id],
    queryFn: async () => {
      if (!id) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      const [selfWeighs, measured] = await Promise.all([
        supabase
          .from("daily_metrics")
          .select("date, weight_kg")
          .eq("user_id", id)
          .gte("date", startDate)
          .order("date", { ascending: true }),
        supabase
          .from("body_measurements")
          .select("date, weight_kg")
          .eq("athlete_id", id)
          .gte("date", startDate)
          .order("date", { ascending: true }),
      ]);

      if (selfWeighs.error) throw selfWeighs.error;
      if (measured.error) throw measured.error;
      return mergeWeightSources(selfWeighs.data ?? [], measured.data ?? []);
    },
    enabled: !!id,
  });

  // Fetch this week's workouts for compliance
  const { data: weeklyWorkouts } = useQuery({
    queryKey: ["athlete-weekly-workouts", id],
    queryFn: async () => {
      if (!id) return [];
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
      const weekEnd = addDays(weekStart, 6);

      const { data, error } = await supabase
        .from("workout_logs")
        .select("completed_at, workout_id")
        .eq("athlete_id", id)
        .not("completed_at", "is", null)
        .gte("completed_at", weekStart.toISOString())
        .lte("completed_at", addDays(weekEnd, 1).toISOString());

      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch scheduled workouts for this week (for Program tab)
  const { data: scheduledWorkouts } = useQuery({
    queryKey: ["athlete-scheduled-workouts", id],
    queryFn: async () => {
      if (!id) return [];
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);

      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("athlete_id", id)
        .gte("scheduled_date", format(weekStart, "yyyy-MM-dd"))
        .lte("scheduled_date", format(weekEnd, "yyyy-MM-dd"))
        .order("scheduled_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch workout logs for scheduled workouts (to check completion status)
  const { data: workoutLogs } = useQuery({
    queryKey: ["athlete-workout-logs-week", id],
    queryFn: async () => {
      if (!id) return [];
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);

      const { data, error } = await supabase
        .from("workout_logs")
        .select("*, workout_id")
        .eq("athlete_id", id)
        .gte("created_at", weekStart.toISOString())
        .lte("created_at", addDays(weekEnd, 1).toISOString());

      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // ACWR Data
  const { data: acwrData, isLoading: acwrLoading } = useAthleteAcwrData(id);

  // Determine status — archived wins over injured/active in the header badge
  const hasActiveInjuries = injuries && injuries.length > 0;
  const athleteArchived = isArchived(profile?.settings);
  const athleteStatus = athleteArchived ? "archived" : hasActiveInjuries ? "injured" : "active";

  // Get initials
  const getInitials = (name: string) => {
    return name
      .split("")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get neurotype label
  const getNeurotypeLabel = (neurotype: string | null) => {
    const types: Record<string, string> = {
      "1A": "1A - Dominant",
      "1B": "1B - Seeker",
      "2A": "2A - Balanced",
      "2B": "2B - Perfectionist",
      "3": "3 - Serotonin",
    };
    return neurotype ? types[neurotype] || neurotype : null;
  };

  // Readiness shown to the coach is ONLY the measured value: the athlete's
  // subjective_readiness through the single shared 1-10 → 0-100 conversion
  // (same scale the risk overview reads). The old fallback heuristic
  // (base 70 ± sleep/HRV/HR adjustments) fabricated a plausible-looking
  // score when the answer was simply "not measured" — absent stays absent.
  const calculateReadinessScore = () => {
    if (todayMetrics?.subjective_readiness == null) return null;
    return subjectiveReadinessToScore(todayMetrics.subjective_readiness);
  };

  // Weekly compliance calculation
  const getWeeklyCompliance = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const today = new Date();
    const days = [];

    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const dayName = format(day, "EEE", { locale: it });
      const isFuture = isAfter(day, today);
      const isToday = isSameDay(day, today);

      // Check if workout was logged on this day
      const hasWorkout = weeklyWorkouts?.some((w) => {
        if (!w.completed_at) return false;
        return isSameDay(new Date(w.completed_at), day);
      });

      let status: "completed" | "rest" | "missed" | "future" = "future";
      if (!isFuture) {
        status = hasWorkout ? "completed" : isToday ? "rest" : "missed";
      }

      days.push({ day: dayName, date: day, status, isToday });
    }

    const completedDays = days.filter((d) => d.status === "completed").length;
    const pastDays = days.filter((d) => d.status !== "future").length;
    const adherence = pastDays > 0 ? Math.round((completedDays / Math.max(pastDays, 1)) * 100) : 0;

    return { days, adherence, completedDays, pastDays };
  };

  // Get pain status
  const getPainStatus = () => {
    if (injuries && injuries.length > 0) {
      const primaryInjury = injuries[0];
      // Map status to severity display
      const severityMap: Record<string, string> = {
        active: "moderate",
        recovering: "mild",
        healed: "none",
      };
      return {
        hasPain: true,
        location: primaryInjury.body_zone || "Unknown",
        severity: severityMap[primaryInjury.status] || "moderate",
        description: primaryInjury.description,
        count: injuries.length,
      };
    }

    return { hasPain: false };
  };

  const readinessScore = calculateReadinessScore();
  const weeklyCompliance = getWeeklyCompliance();
  const painStatus = getPainStatus();

  // Readiness color based on score
  const getReadinessColor = (score: number | null) => {
    if (score === null)
      return {
        text: "text-muted-foreground",
        bg: "bg-muted",
        stroke: "stroke-muted-foreground",
      };
    if (score < 40)
      return {
        text: "text-destructive",
        bg: "bg-destructive/10",
        stroke: "stroke-destructive",
      };
    if (score < 70)
      return {
        text: "text-warning",
        bg: "bg-warning/10",
        stroke: "stroke-warning",
      };
    return {
      text: "text-success",
      bg: "bg-success/10",
      stroke: "stroke-success",
    };
  };

  const readinessColors = getReadinessColor(readinessScore);

  // Get weekly schedule for Program tab
  const getWeeklySchedule = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const today = new Date();
    const days = [];

    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const dateStr = format(day, "yyyy-MM-dd");
      const isFuture = isAfter(day, today);
      const isToday = isSameDay(day, today);
      const isPast = isBefore(day, today) && !isToday;

      // Find scheduled workout for this day
      const scheduledWorkout = scheduledWorkouts?.find((w) => w.scheduled_date === dateStr);

      // Check if workout was completed
      const completedLog = scheduledWorkout
        ? workoutLogs?.find((log) => log.workout_id === scheduledWorkout.id && log.completed_at)
        : null;

      let status: "completed" | "scheduled" | "missed" | "rest" = "rest";
      if (scheduledWorkout) {
        if (completedLog) {
          status = "completed";
        } else if (isPast) {
          status = "missed";
        } else {
          status = "scheduled";
        }
      }

      days.push({
        date: day,
        dateStr,
        dayName: format(day, "EEE", { locale: it }),
        dayNumber: format(day, "d"),
        isToday,
        isFuture,
        isPast,
        workout: scheduledWorkout,
        completedLog,
        status,
      });
    }

    return days;
  };

  // Calculate phase progress
  const getPhaseProgress = () => {
    if (!currentPhase) return null;

    const start = new Date(currentPhase.start_date);
    const end = new Date(currentPhase.end_date);
    const today = new Date();

    const totalDays = differenceInDays(end, start);
    const elapsedDays = differenceInDays(today, start);
    const percentage = Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100));

    const totalWeeks = Math.ceil(differenceInWeeks(end, start)) || 1;
    const currentWeek = Math.min(Math.ceil(differenceInWeeks(today, start)) + 1, totalWeeks);

    return {
      percentage: Math.round(percentage),
      currentWeek,
      totalWeeks,
      daysRemaining: Math.max(0, differenceInDays(end, today)),
    };
  };

  // Calculate weekly totals for stats footer
  const getWeeklyStats = () => {
    const schedule = getWeeklySchedule();
    let totalSets = 0;
    const focusTypes = new Set<string>();

    schedule.forEach((day) => {
      if (day.workout) {
        const structure = day.workout.structure as Array<{ sets?: number }>;
        if (Array.isArray(structure)) {
          structure.forEach((exercise) => {
            totalSets += exercise.sets || 0;
          });
        }
        // Add focus type from phase if available
        if (currentPhase?.focus_type) {
          focusTypes.add(currentPhase.focus_type);
        }
      }
    });

    const workoutsPlanned = schedule.filter((d) => d.workout).length;
    const workoutsCompleted = schedule.filter((d) => d.status === "completed").length;

    return {
      totalSets,
      focusTypes: Array.from(focusTypes),
      workoutsPlanned,
      workoutsCompleted,
    };
  };

  const weeklySchedule = getWeeklySchedule();
  const phaseProgress = getPhaseProgress();
  const weeklyStats = getWeeklyStats();
  if (profileLoading) {
    return (
      <CoachLayout title="Caricamento..." subtitle="">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </CoachLayout>
    );
  }

  // Not found state
  if (!profile) {
    return (
      <CoachLayout title="Atleta non trovato" subtitle="">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">Questo atleta non esiste o non hai accesso.</p>
          <Button onClick={() => navigate("/coach/athletes")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna agli Atleti
          </Button>
        </Card>
      </CoachLayout>
    );
  }

  return (
    <CoachLayout title="" subtitle="">
      <div className="space-y-6 animate-fade-in">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/coach/athletes")}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna al Roster
        </Button>

        {/* Header Section */}
        <Card className="overflow-hidden border-0 shadow-lg">
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              {/* Large Avatar */}
              <Avatar className="h-24 w-24 md:h-28 md:w-28 border-4 border-background shadow-xl ring-2 ring-primary/20">
                <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl md:text-3xl font-bold">
                  {getInitials(profile.full_name || "A")}
                </AvatarFallback>
              </Avatar>

              {/* Info Section */}
              <div className="flex-1 space-y-4">
                {/* Name and Status */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                    {profile.full_name || "Nome non disponibile"}
                  </h1>
                  <Badge
                    variant={athleteStatus === "injured" ? "destructive" : "secondary"}
                    className={cn(
                      "text-xs font-semibold px-3 py-1 w-fit",
                      athleteStatus === "active" &&
                        "bg-success/15 text-success border-success/30 hover:bg-success/20",
                    )}
                  >
                    {athleteStatus === "archived" ? (
                      <>
                        <Archive className="h-3.5 w-3.5 mr-1.5" />
                        Archiviato
                      </>
                    ) : athleteStatus === "injured" ? (
                      <>
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Infortunato
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Attivo
                      </>
                    )}
                  </Badge>
                </div>

                {/* Metadata Tags */}
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  {profile.neurotype && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-sm">
                      <Brain className="h-3.5 w-3.5 text-primary" />
                      <span className="text-muted-foreground">Neurotype:</span>
                      <span className="font-medium text-foreground">
                        {getNeurotypeLabel(profile.neurotype)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Program:</span>
                    <span className="font-medium text-foreground">
                      {currentPhase?.name || "Nessun programma"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-sm">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Last Active:</span>
                    <span className="font-medium text-foreground">
                      {latestWorkout?.completed_at
                        ? formatDistanceToNow(new Date(latestWorkout.completed_at), {
                            addSuffix: true,
                            locale: it,
                          })
                        : "Mai"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Visualizza come Atleta"
                        onClick={() => setGodModeOpen(true)}
                      >
                        <Smartphone className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Visualizza come Atleta</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Altre opzioni">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => setActiveTab("settings")}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Modifica profilo
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => navigate("/coach/messages")}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Messaggi
                    </DropdownMenuItem>
                    {!athleteArchived && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive focus:text-destructive"
                          onSelect={() => {
                            setActiveTab("settings");
                            // Defer past the dropdown close so Radix releases
                            // its focus/pointer-events lock before the modal
                            // opens (dropdown -> dialog interaction).
                            setTimeout(() => setArchiveDialogOpen(true), 0);
                          }}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archivia
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </Card>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="bg-muted/50 p-1 h-auto flex-wrap md:flex-nowrap w-max md:w-full">
              <TabsTrigger value="overview" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline">Panoramica</span>
                <span className="sm:hidden">Panoramica</span>
              </TabsTrigger>
              <TabsTrigger value="program" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Dumbbell className="h-4 w-4" />
                <span className="hidden sm:inline">Programma</span>
                <span className="sm:hidden">Programma</span>
              </TabsTrigger>
              <TabsTrigger value="periodizzazione" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Periodizzazione</span>
                <span className="sm:hidden">Fasi</span>
              </TabsTrigger>
              <TabsTrigger value="exercise-stats" className="gap-2 text-xs md:text-sm px-3 py-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Statistiche Esercizi</span>
                <span className="sm:hidden">Stat.</span>
              </TabsTrigger>
              <TabsTrigger value="vbt-analytics" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">Analisi VBT</span>
                <span className="sm:hidden">VBT</span>
              </TabsTrigger>
              <TabsTrigger value="advanced-stats" className="gap-2 text-xs md:text-sm px-3 py-2">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Statistiche Avanzate</span>
                <span className="sm:hidden">Avanzate</span>
              </TabsTrigger>
              <TabsTrigger value="body-metrics" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Scale className="h-4 w-4" />
                <span className="hidden sm:inline">Misure Corporee</span>
                <span className="sm:hidden">Misure</span>
              </TabsTrigger>
              <TabsTrigger value="progress-pics" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Camera className="h-4 w-4" />
                <span className="hidden sm:inline">Foto Progresso</span>
                <span className="sm:hidden">Foto</span>
              </TabsTrigger>
              <TabsTrigger value="strategy" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Utensils className="h-4 w-4" />
                <span className="hidden sm:inline">Strategia</span>
                <span className="sm:hidden">Strategia</span>
              </TabsTrigger>
              <TabsTrigger value="salute" className="gap-2 text-xs md:text-sm px-3 py-2">
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Salute</span>
                <span className="sm:hidden">Salute</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2 text-xs md:text-sm px-3 py-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Impostazioni</span>
                <span className="sm:hidden">Impostazioni</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab - Bento Grid */}
          <TabsContent value="overview" className="space-y-6">
            <OverviewTab
              athleteId={id!}
              readinessScore={readinessScore}
              readinessColors={readinessColors}
              acwrLoading={acwrLoading}
              acwrData={acwrData}
              weightTrend={weightTrend}
              weeklyCompliance={weeklyCompliance}
              painStatus={painStatus}
            />
          </TabsContent>

          {/* Program Tab - Weekly Microcycle */}
          <TabsContent value="program" className="space-y-6">
            <ProgramTab
              athleteId={id!}
              currentPhase={currentPhase}
              phaseProgress={phaseProgress}
              weeklySchedule={weeklySchedule}
              weeklyStats={weeklyStats}
            />
          </TabsContent>

          <TabsContent value="periodizzazione" className="space-y-6">
            <PeriodizationTab athleteId={id} />
          </TabsContent>

          <TabsContent value="exercise-stats" className="space-y-6">
            <ExerciseStatsContent athleteId={id} />
          </TabsContent>

          <TabsContent value="advanced-stats" className="space-y-6">
            <AdvancedStatsContent athleteId={id} />
          </TabsContent>

          <TabsContent value="body-metrics" className="space-y-6">
            <BodyMetricsContent athleteId={id} />
          </TabsContent>

          <TabsContent value="progress-pics" className="space-y-6">
            <ProgressPicsContent athleteId={id} />
          </TabsContent>

          <TabsContent value="vbt-analytics" className="space-y-6">
            <VelocityTrendChart athleteId={id} />
            <FeatureGate feature="video_feedback">
              <BarPathGallery athleteId={id} />
            </FeatureGate>
          </TabsContent>

          <TabsContent value="strategy" className="space-y-6">
            <StrategyContent athleteId={id} />
          </TabsContent>

          <TabsContent value="salute" className="space-y-6">
            <HealthProfileTab athleteId={id} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <SettingsContent
              athleteId={id}
              profile={profile}
              onProfileUpdate={() => {}}
              archiveDialogOpen={archiveDialogOpen}
              onArchiveDialogOpenChange={setArchiveDialogOpen}
            />
          </TabsContent>
        </Tabs>

        {/* God Mode - View as Athlete */}
        <AthleteViewerDialog
          athleteId={id!}
          athleteName={profile.full_name || "Atleta"}
          open={godModeOpen}
          onOpenChange={setGodModeOpen}
        />
      </div>
    </CoachLayout>
  );
}
