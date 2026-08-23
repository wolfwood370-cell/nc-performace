import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import ReactMarkdown from "react-markdown";

interface AiInsightCardProps {
  athleteId: string | undefined;
}

interface AiInsight {
  id: string;
  athlete_id: string;
  coach_id: string;
  week_start_date: string;
  insight_text: string;
  sentiment_score: number;
  created_at: string;
}

function getSentimentConfig(score: number) {
  if (score >= 0.7)
    return {
      border: "border-success/50",
      bg: "bg-success/5",
      badge: "bg-success/15 text-success border-success/30",
      label: "Eccellente",
      icon: CheckCircle2,
    };
  if (score >= 0.4)
    return {
      border: "border-warning/50",
      bg: "bg-warning/5",
      badge: "bg-warning/15 text-warning border-warning/30",
      label: "Attenzione",
      icon: AlertTriangle,
    };
  return {
    border: "border-destructive/50",
    bg: "bg-destructive/5",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    label: "Critico",
    icon: TrendingDown,
  };
}

export function AiInsightCard({ athleteId }: AiInsightCardProps) {
  const queryClient = useQueryClient();

  const { data: insight, isLoading } = useQuery({
    queryKey: ["ai-insight", athleteId],
    queryFn: async () => {
      if (!athleteId) return null;
      const { data, error } = await supabase
        .from("athlete_ai_insights")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AiInsight | null;
    },
    enabled: !!athleteId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("analyze-athlete-week", {
        body: { athlete_id: athleteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as AiInsight;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-insight", athleteId] });
      toast.success("Analisi AI generata", {
        description: "Il report settimanale è stato aggiornato.",
      });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Errore generazione analisi";
      toast.error("Errore AI", { description: message });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiato negli appunti");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const sentiment = insight ? getSentimentConfig(insight.sentiment_score) : null;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors",
        insight && sentiment ? `${sentiment.border} ${sentiment.bg}` : "",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Analisi AI Settimanale
                {insight && sentiment && (
                  <Badge className={cn("text-3xs border", sentiment.badge)}>
                    {sentiment.label}
                  </Badge>
                )}
              </CardTitle>
              {insight && (
                <p className="text-xs text-muted-foreground">
                  Settimana del{" "}
                  {format(new Date(insight.week_start_date), "d MMMM yyyy", { locale: it })}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="gap-1.5"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {insight ? "Rigenera" : "Genera Analisi"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!insight ? (
          <div className="text-center py-8">
            <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">Nessuna analisi disponibile</p>
            <p className="text-xs text-muted-foreground">
              Clicca "Genera Analisi" per creare il report settimanale AI.
            </p>
          </div>
        ) : (
          <>
            {/* Markdown Report */}
            <div className="relative">
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:first:mt-0 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2">
                <ReactMarkdown>{insight.insight_text}</ReactMarkdown>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copia insight"
                className="absolute top-0 right-0 h-7 w-7 opacity-50 hover:opacity-100"
                onClick={() => copyToClipboard(insight.insight_text)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>

            {/* Sentiment bar */}
            <div className="flex items-center gap-3 pt-2 border-t border-border/50">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 cursor-help whitespace-nowrap">
                      Stato di Forma
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  {/* Name what the number IS: an AI-assigned qualitative
                      score on the weekly report — no RPE/VBT/recovery index
                      is computed anywhere. */}
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    Valutazione qualitativa (0-100%) assegnata dall&apos;AI al report della
                    settimana. Non è un indice calcolato da RPE o metriche di recupero.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    insight.sentiment_score >= 0.7 && "bg-success",
                    insight.sentiment_score >= 0.4 && insight.sentiment_score < 0.7 && "bg-warning",
                    insight.sentiment_score < 0.4 && "bg-destructive",
                  )}
                  style={{ width: `${insight.sentiment_score * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {(insight.sentiment_score * 100).toFixed(0)}%
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
