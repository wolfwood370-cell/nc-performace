// =============================================================================
// src/components/coach/program/GenerateAiWeekDialog.tsx
// =============================================================================
// Modal coach-facing: genera la settimana selezionata con l'IA invocando la
// edge function `generate-program` (via useGenerateProgram) e applicando il
// risultato al builder con `replaceWeekWithAiProgram`.
//
// Flusso:
//   1. Il coach apre il modal dal bottone "Genera Settimana IA" nell'header.
//   2. Compila focus_goal (obbligatorio), equipment (opzionale), mode.
//   3. onSubmit → mutate({ athlete_id, focus_goal, days_per_week, equipment, mode }).
//   4. onSuccess → mapAiDaysToSessions(data.days, library) → store.replaceWeekWithAiProgram.
//
// `days_per_week` = numero di sessioni della settimana selezionata (passato come
// prop dalla pagina). Persistenza: nessuna nuova mutation — il coach salva con il
// `useSaveProgramBlock()` esistente. Errori IA gestiti da useGenerateProgram (toast).
// =============================================================================

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGenerateProgram } from "@/hooks/useGenerateProgram";
import { useExerciseLibraryQuery } from "@/hooks/useExerciseLibraryQuery";
import { useAdvancedProgramStore } from "@/stores/useAdvancedProgramStore";
import { mapAiDaysToSessions } from "@/lib/program/aiProgramMapper";
import type { UUID } from "@/types/training";

const generateFormSchema = z.object({
  focus_goal: z.string().min(1, "Indica un obiettivo di focus").max(120, "Obiettivo troppo lungo"),
  equipment: z.string().max(200, "Elenco attrezzatura troppo lungo").optional(),
  mode: z.enum(["new", "continue"]),
});

type GenerateFormData = z.infer<typeof generateFormSchema>;

interface GenerateAiWeekDialogProps {
  /** `block.athlete_id` — richiesto: senza atleta il bottone è disabilitato. */
  athleteId: string | undefined;
  /** Id della settimana selezionata, target del rimpiazzo. */
  weekId: UUID | null;
  /** `Microcycle.order` (1-indexed) della settimana selezionata, per i messaggi. */
  weekOrder: number | undefined;
  /** Numero di sessioni della settimana selezionata → `days_per_week`. */
  daysPerWeek: number;
}

export function GenerateAiWeekDialog({
  athleteId,
  weekId,
  weekOrder,
  daysPerWeek,
}: GenerateAiWeekDialogProps) {
  const [open, setOpen] = useState(false);

  const generate = useGenerateProgram();
  const isPending = generate.isPending;

  // Libreria esercizi per il match nome→exercise_id nel mapper. Caricata solo
  // a modal aperto (il tempo di compilazione del form copre il fetch). Limite
  // alto: il match non deve essere troncato quando la libreria sarà popolata.
  const { data: library = [] } = useExerciseLibraryQuery({ enabled: open, limit: 1000 });

  const replaceWeekWithAiProgram = useAdvancedProgramStore((s) => s.replaceWeekWithAiProgram);

  const form = useForm<GenerateFormData>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: {
      focus_goal: "",
      equipment: "",
      mode: "new",
    },
  });

  const mode = form.watch("mode");

  // Motivo di disabilitazione del trigger (anche tooltip). isPending è gestito a
  // parte: durante la generazione il bottone mostra lo spinner.
  const disabledReason = !athleteId
    ? "Assegna un atleta prima di generare"
    : daysPerWeek === 0
      ? "La settimana selezionata non ha sessioni"
      : undefined;

  const handleOpenChange = (next: boolean) => {
    // Non chiudere mentre l'IA sta generando — evita stati orfani.
    if (isPending && !next) return;
    if (!next) form.reset();
    setOpen(next);
  };

  const onSubmit = (values: GenerateFormData) => {
    // Guard difensivo: il trigger è già disabilitato senza questi requisiti.
    if (!athleteId || !weekId) return;

    generate.mutate(
      {
        athlete_id: athleteId,
        focus_goal: values.focus_goal.trim(),
        days_per_week: daysPerWeek,
        equipment: values.equipment?.trim() || undefined,
        mode: values.mode,
      },
      {
        onSuccess: (data) => {
          const sessions = mapAiDaysToSessions(data.days, library);
          replaceWeekWithAiProgram(weekId, sessions, data.rationale);
          toast.success("Settimana generata con l'IA", {
            description: `${sessions.length} ${
              sessions.length === 1 ? "sessione applicata" : "sessioni applicate"
            } alla Settimana ${weekOrder ?? "—"}. Salva per persistere.`,
          });
          form.reset();
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!disabledReason || isPending}
          className="gap-2"
          title={disabledReason ?? "Genera la settimana selezionata con l'IA"}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 text-primary" />
          )}
          Genera Settimana IA
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Genera Settimana con IA
          </DialogTitle>
          <DialogDescription>
            L'IA genera {daysPerWeek} {daysPerWeek === 1 ? "sessione" : "sessioni"} per la Settimana{" "}
            {weekOrder ?? "—"}. Sostituirà il contenuto attuale della settimana; salva il blocco per
            persistere.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="focus_goal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Obiettivo / focus</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Es. ipertrofia gambe, forza massimale…"
                      maxLength={120}
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="equipment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attrezzatura (opzionale)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Es. bilanciere, manubri, rack…"
                      maxLength={200}
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modalità</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="new">Nuovo programma</SelectItem>
                      <SelectItem value="continue">Continua progressione</SelectItem>
                    </SelectContent>
                  </Select>
                  {mode === "continue" && (
                    <FormDescription>
                      "Continua" usa lo storico di allenamento dell'atleta per progredire dal blocco
                      precedente. Se l'atleta non ha storico, l'IA partirà da zero.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generazione…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Genera
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
