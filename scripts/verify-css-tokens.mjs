/**
 * scripts/verify-css-tokens.mjs
 * ---------------------------------------------------------------------------
 * Gate for a defect class that `tsc`, eslint and vitest are all blind to:
 * a Tailwind class that does not exist is not an error, it is CSS that is
 * not there. `bg-error-container` shipped through every green gate and the
 * coach read a severity pill with no colour on it.
 *
 * Two things are asserted against the BUILT stylesheet, because only the
 * built stylesheet knows what Tailwind actually emitted:
 *
 *   1. the selector exists (the utility was generated at all), and
 *   2. its declaration points at the expected CSS variable (the utility was
 *      not quietly re-pointed at something else), and
 *   3. that variable is declared in the same stylesheet (a class that reads
 *      an undefined var paints nothing — same invisible outcome).
 *
 * Opacity variants are listed on purpose: in Tailwind v3 a colour declared
 * as a complete `var(--x)` silently drops the opacity modifier — no rule is
 * emitted. Half of the call sites below need it.
 *
 * Usage: npm run build && npm run verify:css
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist/assets";

/** class → { varName, sites }. `sites` is documentation that travels with the assertion. */
const EXPECTED = {
  "bg-error-container": { var: "--error-container", sites: "CoachHome.tsx:89" },
  "text-on-error-container": { var: "--on-error-container", sites: "CoachHome.tsx:90" },
  "text-error-container": { var: "--error-container", sites: "CoachHome.tsx:207" },
  "bg-error-container/40": { var: "--error-container", sites: "AthleteCard.tsx:360" },
  "bg-error-container/30": {
    var: "--error-container",
    sites: "CoachCheckinInbox.tsx:155,635,800",
  },
  "bg-error-container/20": { var: "--error-container", sites: "CoachCheckinInbox.tsx:598" },
  "text-error": { var: "--error", sites: "ExitWorkoutDialog.tsx:161 · WeeklyCheckin.tsx:211" },
  "bg-error": { var: "--error", sites: "ActiveWorkout.tsx:194" },
};

if (!existsSync(dir)) {
  console.error(`✗ ${dir} non esiste. Esegui prima: npm run build`);
  process.exit(1);
}

const sheets = readdirSync(dir).filter((f) => f.endsWith(".css"));
if (sheets.length === 0) {
  console.error(`✗ nessun .css in ${dir}. Esegui prima: npm run build`);
  process.exit(1);
}

const css = sheets.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
console.log(`CSS analizzato: ${sheets.join(", ")} (${css.length} byte)`);

/** Tailwind escapes `/` in a class name: `bg-error-container\/40`. */
const selectorOf = (cls) => "." + cls.replace("/", "\\/");

const failures = [];

for (const [cls, { var: varName, sites }] of Object.entries(EXPECTED)) {
  const start = css.indexOf(selectorOf(cls) + "{");
  if (start === -1) {
    failures.push(`${cls} — nessuna regola emessa (usata in ${sites})`);
    continue;
  }
  const rule = css.slice(start, css.indexOf("}", start) + 1);
  if (!rule.includes(`var(${varName})`)) {
    failures.push(`${cls} — emessa ma non legge var(${varName}): ${rule}`);
    continue;
  }
  if (!css.includes(`${varName}:`)) {
    failures.push(`${cls} — legge var(${varName}), che non è dichiarata in nessun foglio`);
    continue;
  }
  console.log(`  ✓ ${cls.padEnd(24)} → var(${varName})`);
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} classi di gravità non arrivano nel CSS:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nUna classe che non esiste non è un errore: è CSS che non c'è. " +
      "Controlla `tailwind.config.ts` e le variabili in `src/index.css`.",
  );
  process.exit(1);
}

console.log(`\n✓ ${Object.keys(EXPECTED).length}/${Object.keys(EXPECTED).length} classi presenti.`);
