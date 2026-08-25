// ── Session RPE (sRPE) — single home (B-22) ────────────────────────────
// The ONLY place in the app that owns the session-RPE scale: values,
// anchors, definition, the "not the mean of the sets" rule and the timing
// advisory. No component keeps its own copy of these words — when the
// course enters the app it will read from here too.
//
// The scale is Foster's MODIFIED CR-10 (Haddad et al. 2017, Table 1) —
// the only scale sRPE × duration is validated on. Do not confuse it with
// Borg's original CR-10 (different anchors). Two declared bounds:
//   - Foster's `0 = Rest` is NOT representable: the DB CHECK is 1..10, and
//     a completed session is never "rest" — the product's scale is
//     declared 1-10, not passed off as the source's 0-10;
//   - the gaps at 6, 8 and 9 are the scale's DESIGN, not missing data: a
//     category-ratio scale anchors some steps with words and forces the
//     answerer to INTERPOLATE across the gaps. Filling them would change
//     the instrument (CORE §0.11: one name, one scale, one interval).
//
// The Italian wording is a translation of Foster's descriptors (ratified
// path: Nicolò 24/08 — the product follows Foster; the course's Lezione 8
// realignment is his, in the other repo). If he dictates other words they
// win — the invariant is that they are THE SAME everywhere.
//
// This is also a declared divergence from the collection protocol of the
// literature (30 min post-session) and the course (5-10 min): the product
// asks immediately (Nicolò 24/08 — collected imperfect beats never
// collected), so the sRPE gathered here is comparable with itself over
// time, not with literature thresholds.

export const SESSION_RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type SessionRpe = (typeof SESSION_RPE_VALUES)[number];

/** Anchors of Foster's modified CR-10, translated. `null` is a DELIBERATE
 *  gap of the source scale — never fill it with a word. */
export const SESSION_RPE_ANCHORS: Record<SessionRpe, string | null> = {
  1: "Molto, molto facile",
  2: "Facile",
  3: "Moderato",
  4: "Abbastanza impegnativo",
  5: "Impegnativo",
  6: null,
  7: "Molto impegnativo",
  8: null,
  9: null,
  10: "Massimale",
};

/** Question heading + prompt shown in the debrief. */
export const SESSION_RPE_TITLE = "RPE della Sessione";
export const SESSION_RPE_QUESTION = "Quanto è stato impegnativo l'allenamento complessivo?";

/** The rule that separates this scale from the per-set RPE. */
export const SESSION_RPE_DEFINITION =
  "È una valutazione globale della seduta, non la media delle serie.";

/** Timing advisory — the course's "finestra di normalizzazione". */
export const SESSION_RPE_TIMING =
  "Aspetta la finestra di normalizzazione: il giudizio migliore arriva qualche minuto dopo la fine, non mentre ti allacci le scarpe.";

/** What a surface prints when the athlete declared nothing: absence stays
 *  absence — never 0, never a fallback number. */
export const SESSION_RPE_ABSENT = "—";
