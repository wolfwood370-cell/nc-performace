// ── Session RPE (sRPE) — single home (B-22) ────────────────────────────
// The ONLY place in the app that owns the session-RPE scale: values,
// anchors, definition, the "not the mean of the sets" rule, the timing
// advisory and every word of the familiarization card. No component keeps
// its own copy of these words — when the course enters the app it will
// read from here too.
//
// The scale derives from Foster's MODIFIED CR-10 (Haddad et al. 2017,
// Table 1) — the only scale sRPE × duration is validated on. Do not
// confuse it with Borg's original CR-10 (different anchors).
//
// ⚠ THREE DECLARED DEVIATIONS make this OUR variant of Foster's scale
// (ratified by Nicolò, 24-25/08). The consequence is written below and
// shown in-product: the resulting load is comparable with ITSELF over
// time, not with literature thresholds — one more reason the
// acute:chronic ratio stays a lens, never a judge.
//   1. Range 1-10, not 0-10: Foster's `0 = Rest` is not representable
//      (DB CHECK 1..10), and a completed session is never "rest".
//   2. The question is asked IMMEDIATELY, not at 30 min (literature) nor
//      5-10 min (course): a collected imperfect datum beats a perfect one
//      never collected. The normalization-window advisory stays visible.
//   3. The anchors at 6, 8 and 9 are OURS (see SESSION_RPE_OWN_ANCHORS):
//      Foster leaves those steps wordless; with a slider the anchor is
//      the ONE word the athlete reads, so a gap there is no longer
//      prudence but a calibration hole. They are lexical interpolations
//      between Foster's anchors (no new physiological claim); 9/10 mirror
//      the method's own per-set pair "one in reserve / nothing in
//      reserve" at session level. Deliberately NOT imported: the course's
//      Talk-Test wordings — cardio referents that do not hold in the
//      weight room.
//
// Reliability bounds the product declares instead of hiding (Haddad
// 2017): familiarization is a PREREQUISITE of the source («the athlete
// should be familiarized with this scale … before beginning to collect
// reliable measures») — hence the always-reachable card below; and in
// resistance training the method shows its WEAKEST correlations
// (r = 0.25-0.52 vs 0.67-0.82 in technical/conditioning work).
//
// If Nicolò dictates other words they win — the invariant is that they
// are THE SAME everywhere, and they change HERE.

export const SESSION_RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type SessionRpe = (typeof SESSION_RPE_VALUES)[number];

/** The complete scale. 1-5, 7, 10 translate Foster's descriptors; 6, 8, 9
 *  are OURS (SESSION_RPE_OWN_ANCHORS) — deviation 3 in the header. */
export const SESSION_RPE_ANCHORS: Record<SessionRpe, string> = {
  1: "Molto, molto facile",
  2: "Facile",
  3: "Moderato",
  4: "Abbastanza impegnativo",
  5: "Impegnativo",
  6: "Decisamente impegnativo",
  7: "Molto impegnativo",
  8: "Estremamente impegnativo",
  9: "Quasi massimale",
  10: "Massimale",
};

/** The steps whose words are ours, not Foster's — marked so nobody
 *  mistakes the interpolations for source anchors. */
export const SESSION_RPE_OWN_ANCHORS: readonly SessionRpe[] = [6, 8, 9];

/** Question heading + prompt shown in the debrief. */
export const SESSION_RPE_TITLE = "RPE della Sessione";
export const SESSION_RPE_QUESTION = "Quanto è stato impegnativo l'allenamento complessivo?";

/** The rule that separates this scale from the per-set RPE. */
export const SESSION_RPE_DEFINITION =
  "È una valutazione globale della seduta, non la media delle serie.";

/** Timing advisory — the course's "finestra di normalizzazione". */
export const SESSION_RPE_TIMING =
  "Aspetta la finestra di normalizzazione: il giudizio migliore arriva qualche minuto dopo la fine, non mentre ti allacci le scarpe.";

/** Deviation 2's consequence, shown next to the card: self-comparison,
 *  not literature thresholds. */
export const SESSION_RPE_COMPARABILITY =
  "Questo numero serve a confrontarti con te stesso nel tempo, non con soglie esterne.";

/** Empty-state wording of the control: no value exists until the athlete
 *  makes a gesture (CORE §0.8 — a resting slider thumb IS a preselected
 *  answer, so there is no thumb at all). */
export const SESSION_RPE_UNANSWERED = "Non risposto";
export const SESSION_RPE_EMPTY_PROMPT = "Trascina o tocca la scala per rispondere";

/** Accessible name of the slider control. */
export const SESSION_RPE_SLIDER_LABEL = "Scala RPE di sessione da 1 a 10";

/** Accessible names of the section and the guide's lists — AT-facing scale
 *  text lives here too: the single-home contract does not distinguish
 *  between what the eye reads and what a screen reader announces. */
export const SESSION_RPE_SECTION_LABEL = "Sforzo percepito della sessione";
export const SESSION_RPE_GUIDE_ANCHORS_LABEL = "Le dieci ancore della scala";
export const SESSION_RPE_GUIDE_EXAMPLES_LABEL = "Due esempi";

/** What a surface prints when the athlete declared nothing: absence stays
 *  absence — never 0, never a fallback number. */
export const SESSION_RPE_ABSENT = "—";

/** The revocation affordance: a declared answer can go back to null. */
export const SESSION_RPE_CLEAR_LABEL = "Rimuovi risposta";

/** Familiarization card ("Come si valuta?") — the source's prerequisite,
 *  always reachable, never forced, never remembered. */
export const SESSION_RPE_GUIDE_TITLE = "Come si valuta?";

/** Two worked examples, re-anchored to THIS scale (the course's Lezione 8
 *  examples carried words Foster puts elsewhere; re-anchoring to 3-4 and
 *  7-8 is the ratified direction of 24/08). Same teaching point: the
 *  session judgment is not the per-set judgment. */
export const SESSION_RPE_EXAMPLES: readonly string[] = [
  "Serie pesanti e vicine al limite, ma seduta breve e sei uscito fresco: RPE di sessione 3-4.",
  "Circuito lungo senza pause: nessuna serie estrema, ma alla fine sei senza fiato: RPE di sessione 7-8.",
];
