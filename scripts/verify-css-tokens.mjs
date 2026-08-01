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

/**
 * Severity vars that MUST stay in channel form (`H S% L%`), because the
 * utilities above wrap them in `hsl(var(--x) / <alpha-value>)`. Writing a
 * complete `hsl(...)` into one of them yields `hsl(hsl(...) / .4)`, which the
 * browser drops — and the built stylesheet would not change, so the class
 * check alone stays green while the pills go colourless again.
 */
const CHANNEL_VARS = [
  "--error",
  "--error-container",
  "--on-error-container",
  "--tertiary-container",
  "--on-tertiary-container",
];

/** `0 45% 90%` — three space-separated channels, no function call. */
const CHANNEL_FORM = /^[\d.]+\s+[\d.]+%\s+[\d.]+%$/;

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
  // The `Attenzione` step of the same severity scale. Without these the
  // critical chip is filled and the warning one is not, so the middle
  // severity reads as the lightest of the three.
  "bg-tertiary-container/10": {
    var: "--tertiary-container",
    sites: "CoachHome.tsx:97 · CoachAlertsPanel.tsx:77 · AthleteContextPane.tsx:283",
  },
  "border-tertiary-container/20": {
    var: "--tertiary-container",
    sites: "CalendarGrid.tsx:260",
  },
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

// ── 2. The vars themselves are still in channel form, and in `:root` ───────
const rootBlocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");

for (const name of CHANNEL_VARS) {
  const decls = [...css.matchAll(new RegExp(`(?:^|[^-\\w])${name}\\s*:\\s*([^;}]+)`, "g"))].map(
    (m) => m[1].trim(),
  );
  if (decls.length === 0) {
    failures.push(`${name} — non dichiarata in nessun foglio`);
    continue;
  }
  const wrong = decls.filter((v) => !CHANNEL_FORM.test(v));
  if (wrong.length > 0) {
    failures.push(
      `${name} — dichiarata come «${wrong[0]}», non in forma a canali: ` +
        `hsl(var(${name}) / …) diventa CSS invalido e la regola viene scartata`,
    );
    continue;
  }
  if (!new RegExp(`(?:^|[^-\\w])${name}\\s*:`).test(rootBlocks)) {
    failures.push(`${name} — dichiarata solo fuori da :root (il tema chiaro resterebbe scoperto)`);
    continue;
  }
  console.log(`  ✓ ${name.padEnd(24)} = ${decls[0]}`);
}

// ── 3. Nobody overwrites them at runtime ───────────────────────────────────
// `MaterialYouProvider` writes 19 vars with `setProperty(name, hsl(...))`.
// Adding one of these to that list is the natural-looking change that would
// break every tint without touching the built stylesheet at all.
function* sources(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

if (existsSync("src")) {
  for (const file of sources("src")) {
    const body = readFileSync(file, "utf8");
    for (const name of CHANNEL_VARS) {
      if (body.includes(`setProperty("${name}"`) || body.includes(`setProperty('${name}'`)) {
        failures.push(
          `${file} scrive ${name} a runtime: queste variabili devono restare statiche in index.css`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} controlli falliti — la gravità non arriva a schermo:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nUna classe che non esiste non è un errore: è CSS che non c'è. " +
      "Controlla `tailwind.config.ts` e le variabili in `src/index.css`.",
  );
  process.exit(1);
}

console.log(
  `\n✓ ${Object.keys(EXPECTED).length} classi presenti, ` +
    `${CHANNEL_VARS.length} variabili in forma a canali e non riscritte a runtime.`,
);
