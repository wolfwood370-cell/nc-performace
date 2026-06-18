import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarRange, Plus, Pencil, Trash2, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  usePeriodization,
  type TrainingPhase,
  type PhaseFocusType,
} from "@/hooks/usePeriodization";

interface PeriodizationTabProps {
  athleteId: string | undefined;
}

const FOCUS_OPTIONS: { value: PhaseFocusType; label: string }[] = [
  { value: "strength", label: "Forza" },
  { value: "hypertrophy", label: "Ipertrofia" },
  { value: "endurance", label: "Resistenza" },
  { value: "power", label: "Potenza" },
  { value: "recovery", label: "Recupero" },
  { value: "peaking", label: "Peaking" },
  { value: "transition", label: "Transizione" },
];

const FOCUS_LABEL: Record<PhaseFocusType, string> = {
  strength: "Forza",
  hypertrophy: "Ipertrofia",
  endurance: "Resistenza",
  power: "Potenza",
  recovery: "Recupero",
  peaking: "Peaking",
  transition: "Transizione",
};

interface PhaseForm {
  name: string;
  start_date: string;
  end_date: string;
  focus_type: PhaseFocusType;
  base_volume: number;
  notes: string;
}

const EMPTY_FORM: PhaseForm = {
  name: "",
  start_date: "",
  end_date: "",
  focus_type: "strength",
  base_volume: 100,
  notes: "",
};

function fmt(date: string): string {
  try {
    return format(parseISO(date), "dd MMM yyyy", { locale: it });
  } catch {
    return date;
  }
}

/**
 * Coach-side CRUD for an athlete's periodization phases (training_phases).
 * Lists phases chronologically with create / edit / delete; the hook enforces
 * date-overlap validation and surfaces conflicts via toast. Empty-safe: shows an
 * empty state on a fresh backend (0 phases).
 */
export function PeriodizationTab({ athleteId }: PeriodizationTabProps) {
  const { phases, isLoading, createPhase, updatePhase, deletePhase, isCreating, isUpdating } =
    usePeriodization(athleteId ?? null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingPhase | null>(null);
  const [form, setForm] = useState<PhaseForm>(EMPTY_FORM);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (phase: TrainingPhase) => {
    setEditing(phase);
    setForm({
      name: phase.name,
      start_date: phase.start_date,
      end_date: phase.end_date,
      focus_type: phase.focus_type,
      base_volume: phase.base_volume,
      notes: phase.notes ?? "",
    });
    setDialogOpen(true);
  };

  const isValid =
    form.name.trim() !== "" &&
    form.start_date !== "" &&
    form.end_date !== "" &&
    form.start_date <= form.end_date;

  const handleSubmit = async () => {
    if (!isValid) return;
    try {
      if (editing) {
        await updatePhase({ id: editing.id, ...form, notes: form.notes || undefined });
      } else {
        if (!athleteId) return;
        await createPhase({ athlete_id: athleteId, ...form, notes: form.notes || undefined });
      }
      setDialogOpen(false);
    } catch {
      // The hook already surfaces the error (overlap / network) via toast.
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Fasi di periodizzazione</h3>
          <Badge variant="secondary" className="text-2xs tabular-nums">
            {phases.length}
          </Badge>
        </div>
        <Button size="sm" onClick={openCreate} disabled={!athleteId} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuova fase
        </Button>
      </div>

      {phases.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarRange className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessuna fase pianificata</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crea la prima fase per strutturare il macrociclo dell'atleta
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {phases.map((phase) => (
            <Card key={phase.id} className="border border-border shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{phase.name}</p>
                    <Badge variant="secondary" className="shrink-0 text-2xs">
                      {FOCUS_LABEL[phase.focus_type]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarRange className="h-3 w-3" />
                    {fmt(phase.start_date)} → {fmt(phase.end_date)}
                    <span className="text-muted-foreground/60">
                      · vol. base {phase.base_volume}%
                    </span>
                  </p>
                  {phase.notes && (
                    <p className="mt-1 truncate text-xs text-muted-foreground/80">{phase.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Modifica fase"
                    onClick={() => openEdit(phase)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Elimina fase"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare la fase?</AlertDialogTitle>
                        <AlertDialogDescription>
                          La fase "{phase.name}" verrà rimossa dal macrociclo. L'azione è
                          irreversibile.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deletePhase(phase.id).catch(() => {})}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Elimina
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica fase" : "Nuova fase"}</DialogTitle>
            <DialogDescription>
              Le date non possono sovrapporsi ad altre fasi dell'atleta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="phase-name">Nome</Label>
              <Input
                id="phase-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="es. Blocco Forza Base"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phase-start">Inizio</Label>
                <Input
                  id="phase-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phase-end">Fine</Label>
                <Input
                  id="phase-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Focus</Label>
                <Select
                  value={form.focus_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, focus_type: v as PhaseFocusType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOCUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phase-volume">Volume base %</Label>
                <Input
                  id="phase-volume"
                  type="number"
                  min={0}
                  max={300}
                  value={form.base_volume}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, base_volume: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phase-notes">Note</Label>
              <Textarea
                id="phase-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Obiettivi, indicazioni…"
                rows={2}
              />
            </div>

            {form.start_date !== "" && form.end_date !== "" && form.start_date > form.end_date && (
              <p className="text-xs text-destructive">La data di fine precede l'inizio.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid || isCreating || isUpdating}>
              {editing ? "Salva" : "Crea fase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
