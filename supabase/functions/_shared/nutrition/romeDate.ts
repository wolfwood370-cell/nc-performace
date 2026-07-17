// supabase/functions/_shared/nutrition/romeDate.ts
// Europe/Rome calendar-day formatting. Deterministic: the instant comes from
// the caller (I/O layer) — this module never reads the clock itself. A meal
// logged at 00:30 Italian time must land on the Italian day, not on the
// previous UTC day (nutrition_logs.date defaults to CURRENT_DATE = UTC).

const ROME_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Formats an instant as the Europe/Rome calendar day, "YYYY-MM-DD". */
export function romeDayFromDate(instant: Date): string {
  return ROME_DAY_FORMAT.format(instant);
}
