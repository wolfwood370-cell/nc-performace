// =============================================================================
// src/features/intake/config/neurotypeItems.ts
// =============================================================================
// Neurotype questionnaire (30 items, Thibaudeau model) — statement texts
// ported VERBATIM from the retired nc-questionnaire repo:
//   - texts:  src/components/intake/steps/Step8Neurotype.tsx (NEURO_QUESTIONS)
//   - scale:  docs/intake-contract.md §B8 (matches NEURO_LEGEND)
//
// HARD CONSTRAINTS (intake-contract.md §B8):
//   1. ORDER IS BINDING — server scoring is positional (q01..q30). Never
//      reorder, insert or remove items.
//   2. Answers are sent as LETTERS "A".."E" keyed q01..q30.
//   3. Group labels (1A/1B/2A/2B/3) must NEVER be shown to the athlete;
//      pagination copy must be neutral ("Pagina X di 5", never "Gruppo").
//
// The scoring itself is server-side only (submit-intake/intake/neurotype.ts);
// this module intentionally does NOT import it so no scoring weights or
// item→type mapping ever reach the client bundle.
// =============================================================================

export const NEUROTYPE_ITEMS: readonly string[] = [
  "Quando sono in gruppo voglio esserne il leader.",
  "Se il servizio al ristorante è cattivo, non ho problemi a farlo notare apertamente.",
  "Se so che qualcuno ha diffuso voci su di me, sento il bisogno di affrontarlo.",
  "Sento il bisogno di essere il migliore in ogni cosa; anche un gioco banale diventa una sfida.",
  "Se vedo un'opportunità la colgo sempre, anche oltre le mie capacità; preferisco rischiare.",
  "Se non riesco al primo colpo, significa solo che devo lavorare più duramente: ce la farò.",
  "Sono sempre stato agile e veloce, fin da piccolo.",
  "Nel traffico preferisco una deviazione piuttosto che stare in coda, anche se ci metto di più.",
  "In attesa di un appuntamento devo tenermi impegnato: non riesco a stare fermo a far nulla.",
  "Riesco a leggere con musica in sottofondo e trattenere le informazioni.",
  "Quando parlo, spesso cambio argomento a metà conversazione.",
  "Ho bisogno di nuove esperienze o attività spesso, altrimenti mi annoio.",
  'In una conversazione dico spesso "anch\'io", "la penso uguale", "so cosa intendi".',
  "Odio prendere decisioni: preferisco che altri scelgano film o ristorante.",
  'In situazioni adrenaliniche divento la versione "alfa" di me: più sicuro e carismatico.',
  "Rimando le cose fino all'ultimo (procrastino) ed è così che lavoro meglio.",
  "Senza fretta o pressione sono pigro, ma quando le cose si muovono divento molto produttivo.",
  "Sto attento a non ferire i sentimenti degli altri, anche quando la parte offesa sono io.",
  "Sono una persona emotiva: le mie reazioni sono facili e intense (positive o negative).",
  "Preferisco attività che conosco e mi piacciono piuttosto che provare cose nuove.",
  "Ho un cibo preferito che potrei mangiare tutto il giorno.",
  "Ho bisogno di sentirmi desiderato, amato e apprezzato per stare bene.",
  'Ho spesso conversazioni negative con me stesso ("non sono bravo", "non valgo").',
  "Do molto peso a ciò che gli altri pensano di me.",
  "Prendo decisioni basate sui fatti, non su emozioni e istinto.",
  "Non amo attività con fattori di rischio troppo alti.",
  "Mi preoccupo molto per cose che potrebbero andare male in futuro.",
  "Preferisco passare il tempo libero da solo (leggere, tv, gaming) piuttosto che uscire.",
  "Se il successo non arriva subito, mi sta bene un percorso più graduale e lento.",
  'Faccio fatica ad addormentarmi perché non riesco a "spegnere" il cervello.',
];

export const NEUROTYPE_LETTERS = ["A", "B", "C", "D", "E"] as const;
export type NeurotypeLetter = (typeof NEUROTYPE_LETTERS)[number];

/** Answer scale shown once per page (contract §B8 / NEURO_LEGEND). */
export const NEUROTYPE_SCALE: ReadonlyArray<{ letter: NeurotypeLetter; label: string }> = [
  { letter: "A", label: "Mi descrive molto bene (quasi sempre)" },
  { letter: "B", label: "Mi descrive bene (la maggior parte delle volte)" },
  { letter: "C", label: "In parte (poco più della metà)" },
  { letter: "D", label: "Non molto (meno della metà)" },
  { letter: "E", label: "Non mi descrive affatto" },
];

export const NEUROTYPE_TOTAL = 30;
export const NEUROTYPE_PER_PAGE = 6;
export const NEUROTYPE_PAGES = 5;

/**
 * Payload key for item n (1-based): q01..q30. Mirrors the server-side
 * neuroKeyOf (submit-intake/intake/neurotype.ts) — duplicated on purpose so
 * the client never imports the scoring module.
 */
export function neurotypeKey(n: number): string {
  return `q${String(n).padStart(2, "0")}`;
}
