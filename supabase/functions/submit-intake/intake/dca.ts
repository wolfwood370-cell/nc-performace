// DCA screening (SCOFF-style, 3 items) — CORE safety, both coaching modes.
// Deterministic threshold -> boolean flag ONLY: never a clinical score, never
// a diagnosis (prompt §E). A positive flag routes OUT to a professional and
// alerts the coach; the raw yes/no answers stay in onboarding_data.intake
// (visible to owner + coach only).

/** Item texts (Italian, user-facing) — single source for the Fase 2 UI. */
export const DCA_ITEMS = {
  q1: "Negli ultimi mesi ti è capitato di sentire di aver perso il controllo su quanto mangi?",
  q2: "Ti provochi il vomito o usi altri metodi per compensare dopo aver mangiato?",
  q3: "La preoccupazione per il peso o per la forma del corpo domina le tue giornate?",
} as const;

export interface DcaAnswers {
  q1: boolean;
  q2: boolean;
  q3: boolean;
}

/** >= 2 yes out of 3 -> flag. The yes-count is intentionally NOT returned. */
export function evaluateDca(answers: DcaAnswers): { flag: boolean } {
  const yes = [answers.q1, answers.q2, answers.q3].filter(Boolean).length;
  return { flag: yes >= 2 };
}
