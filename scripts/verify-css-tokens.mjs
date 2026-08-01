/**
 * scripts/verify-css-tokens.mjs
 * ---------------------------------------------------------------------------
 * Gate for a defect class that `tsc`, eslint and vitest are all blind to:
 * a Tailwind class that does not exist is not an error, it is CSS that is
 * not there. `bg-error-container` shipped through every green gate and the
 * coach read a severity pill with no colour on it.
 *
 * Four checks, against the BUILT stylesheet, because only the built
 * stylesheet knows what Tailwind actually emitted:
 *
 *   1. the stylesheet is not older than the sources that produce it;
 *   2. every expected class is emitted, reads the expected CSS variable, that
 *      variable is declared (a class reading an undefined var paints nothing
 *      — same invisible outcome), and the class is actually used somewhere;
 *   3. those variables are still in channel form and declared in `:root`
 *      (a complete `hsl(...)` makes `hsl(var(--x) / .4)` invalid and the rule
 *      is dropped, while the built stylesheet does not change at all);
 *   4. no source overwrites them at runtime.
 *
 * Opacity variants are listed on purpose: in Tailwind v3 a colour declared as
 * a complete `var(--x)` silently drops the opacity modifier — no rule is
 * emitted. Most of the severity call sites need it.
 *
 * The call sites are LOOKED UP, never hardcoded: a `file:line` written by
 * hand into this file is wrong by the next commit that shifts a line, and a
 * gate that documents itself wrongly teaches the wrong thing.
 *
 * Declared limits — this gate is narrower than it looks:
 *   - it is not wired to CI (the web job does not build), so it runs when a
 *     human runs it;
 *   - check 4 matches `setProperty("--x"` literally. A template literal, a
 *     computed name, or a loop over an object would slip past it. It holds
 *     today because MaterialYouProvider writes every variable by name.
 *
 * Usage: npm run build && npm run verify:css
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const dirArg = process.argv[2];
const dir = dirArg ?? "dist/assets";

/** Expected class → the CSS variable its declaration must read. */
const EXPECTED = {
  "bg-error-container": "--error-container",
  "text-on-error-container": "--on-error-container",
  "text-error-container": "--error-container",
  "bg-error-container/40": "--error-container",
  "bg-error-container/30": "--error-container",
  "bg-error-container/20": "--error-container",
  "text-error": "--error",
  "bg-error": "--error",
  // The `Attenzione` step of the same severity scale. Without these the
  // critical chip is filled and the warning one is not, so the middle
  // severity reads as the lightest of the three.
  "bg-tertiary-container/10": "--tertiary-container",
  "border-tertiary-container/20": "--tertiary-container",
};

/**
 * Severity vars that MUST stay in channel form (`H S% L%`), because the
 * utilities above wrap them in `hsl(var(--x) / <alpha-value>)`.
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

/** Sources that produce the stylesheet; if newer than it, the build is stale. */
const CSS_SOURCES = ["src/index.css", "tailwind.config.ts"];

const failures = [];

// ── 0. The stylesheet exists ───────────────────────────────────────────────
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

// ── 1. …and is not older than what produces it ─────────────────────────────
// Only meaningful for the project's own build output: an explicit directory
// is someone checking another tree's CSS on purpose.
if (!dirArg) {
  const builtAt = Math.max(...sheets.map((f) => statSync(join(dir, f)).mtimeMs));
  for (const src of CSS_SOURCES.filter(existsSync)) {
    if (statSync(src).mtimeMs > builtAt) {
      failures.push(`${src} è più recente del CSS in ${dir}: esegui npm run build e ripeti`);
    }
  }
}

// ── 2. Every expected class is emitted, and is actually used ───────────────
/** Tailwind escapes `/` in a class name: `bg-error-container\/40`. */
const selectorOf = (cls) => "." + cls.replace("/", "\\/");

function* sources(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

const SOURCE_FILES = existsSync("src") ? [...sources("src")] : [];

/**
 * Where a class is written, computed rather than remembered. Comment lines
 * are skipped: the same class names appear in JSDoc that documents them, and
 * Tailwind emits a class it finds in a comment just as happily — so a class
 * that survives only in documentation would look alive here.
 * The boundaries stop `bg-error` from matching `bg-error-container`, and
 * `bg-error-container` from matching `bg-error-container/40`.
 */
function usagesOf(cls) {
  const re = new RegExp(`(?<![\\w-])${cls.replace("/", "\\/")}(?![\\w-]|/\\d)`);
  const hits = [];
  for (const file of SOURCE_FILES) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
      if (re.test(line)) hits.push(`${file.replace(/\\/g, "/")}:${i + 1}`);
    });
  }
  return hits;
}

for (const [cls, varName] of Object.entries(EXPECTED)) {
  const start = css.indexOf(selectorOf(cls) + "{");
  if (start === -1) {
    failures.push(`${cls} — nessuna regola emessa`);
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
  const sites = usagesOf(cls);
  if (sites.length === 0) {
    failures.push(`${cls} — emessa ma non usata da nessuna parte: l'asserzione non protegge nulla`);
    continue;
  }
  console.log(`  ✓ ${cls.padEnd(30)} → var(${varName})   ${sites.join(" · ")}`);
}

// ── 3. The vars themselves are still in channel form, and in `:root` ───────
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
  console.log(`  ✓ ${name.padEnd(30)} = ${decls[0]}`);
}

// ── 4. Nobody overwrites them at runtime ───────────────────────────────────
// `MaterialYouProvider` writes 19 vars with `setProperty(name, hsl(...))`.
// Adding one of these to that list is the natural-looking change that would
// break every tint without touching the built stylesheet at all.
for (const file of SOURCE_FILES) {
  const body = readFileSync(file, "utf8");
  for (const name of CHANNEL_VARS) {
    if (body.includes(`setProperty("${name}"`) || body.includes(`setProperty('${name}'`)) {
      failures.push(
        `${file} scrive ${name} a runtime: queste variabili devono restare statiche in index.css`,
      );
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
  `\n✓ ${Object.keys(EXPECTED).length} classi presenti e in uso, ` +
    `${CHANNEL_VARS.length} variabili in forma a canali e non riscritte a runtime.`,
);
