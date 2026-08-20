// =============================================================================
// src/components/coach/program/PublishProgramDialog.tsx
// =============================================================================
// The delivery dialog: lists every session of the block with its date,
// PRE-FILLED by the shared convention (defaultSessionDates — the coach's
// model has no weekday field, so a silent derivation would invent an
// assignment the coach never made) and editable one by one. Only what the
// coach confirms enters the document. Refuses: two sessions on the same day,
// a date before start_date, an empty date.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionDateInput } from "../../../../supabase/functions/_shared/program/coachRelease.ts";

export interface PublishDialogSession {
  session_id: string;
  /** Coach-facing row label, e.g. "Settimana 1 · Lower Heavy". */
  label: string;
  /** Pre-filled date from the shared convention (editable). */
  defaultDate: string;
}

export interface PublishProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: PublishDialogSession[];
  /** Block start date — no session may be scheduled before it. */
  startDate: string;
  isPending: boolean;
  onConfirm: (dates: SessionDateInput[]) => void;
}

export function PublishProgramDialog({
  open,
  onOpenChange,
  sessions,
  startDate,
  isPending,
  onConfirm,
}: PublishProgramDialogProps) {
  const [dates, setDates] = useState<Record<string, string>>({});

  // Re-seed the editable dates from the convention each time the dialog
  // opens: the block may have changed since the last publish attempt.
  useEffect(() => {
    if (open) {
      setDates(Object.fromEntries(sessions.map((s) => [s.session_id, s.defaultDate])));
    }
  }, [open, sessions]);

  const problems = useMemo(() => {
    const list: string[] = [];
    const seen = new Map<string, number>();
    let missing = 0;
    let beforeStart = 0;
    for (const s of sessions) {
      const value = dates[s.session_id] ?? "";
      if (!value) {
        missing += 1;
        continue;
      }
      seen.set(value, (seen.get(value) ?? 0) + 1);
      if (value < startDate) beforeStart += 1;
    }
    const clashes = [...seen.values()].filter((n) => n > 1).length;
    if (missing > 0) list.push("Ogni seduta deve avere una data.");
    if (clashes > 0) list.push("Due sedute non possono cadere nello stesso giorno.");
    if (beforeStart > 0)
      list.push(`Nessuna seduta può precedere l'inizio del blocco (${startDate}).`);
    return list;
  }, [dates, sessions, startDate]);

  const canConfirm = problems.length === 0 && sessions.length > 0 && !isPending;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(sessions.map((s) => ({ session_id: s.session_id, date: dates[s.session_id] })));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Consegna la scheda
          </DialogTitle>
          <DialogDescription>
            Conferma il giorno di ogni seduta: le date sono precompilate a partire dalla data
            d'inizio (una settimana per microciclo) e restano modificabili una per una. All'atleta
            arriva ciò che confermi qui.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {sessions.length === 0 && (
            <p className="text-xs text-on-surface-variant">
              Nessuna seduta con esercizi da consegnare: aggiungi gli esercizi alle sedute prima di
              pubblicare.
            </p>
          )}
          {sessions.map((s) => (
            <div key={s.session_id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-medium text-on-surface">
                {s.label}
              </span>
              <Input
                type="date"
                value={dates[s.session_id] ?? ""}
                min={startDate}
                onChange={(e) => setDates((prev) => ({ ...prev, [s.session_id]: e.target.value }))}
                className="h-8 w-[150px] shrink-0 text-xs"
                aria-label={`Data per ${s.label}`}
              />
            </div>
          ))}
        </div>

        {problems.length > 0 && (
          <ul className="space-y-1 text-xs text-destructive">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annulla
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} disabled={!canConfirm}>
            {isPending ? "Consegna in corso…" : "Conferma e consegna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
