/**
 * scripts/verify-css-tokens.mjs
 * ---------------------------------------------------------------------------
 * Gate for a defect class that `tsc`, eslint and vitest are all blind to:
 * a Tailwind class that does not exist is not an error, it is CSS that is
 * not there. `bg-error-container` shipped through every green gate and the
 * coach read a severity pill with no colour on it.
 *
 * Six checks. The first five run against the BUILT stylesheet, because only
 * the built stylesheet knows what Tailwind actually emitted; the sixth reads
 * the sources and `src/index.css` directly, because its defect never reaches
 * the stylesheet at all:
 *
 *   1. the stylesheet is not older than the sources that produce it;
 *   2. every expected class is emitted, reads the expected CSS variable, that
 *      variable is declared (a class reading an undefined var paints nothing
 *      — same invisible outcome), and the class is actually used somewhere;
 *   3. those variables are still in channel form and declared in `:root`
 *      (a complete `hsl(...)` makes `hsl(var(--x) / .4)` invalid and the rule
 *      is dropped, while the built stylesheet does not change at all);
 *   4. no source overwrites them at runtime;
 *   5. DERIVED, no list to maintain: every `*-chart-*` colour utility found
 *      in the sources has an emitted rule. The EXPECTED list below can only
 *      protect what someone remembered to write into it — 24 `chart-[1-5]`
 *      utilities that no config ever knew survived for months under a green
 *      gate exactly this shape. Check 5 scans instead of remembering.
 *   6. DERIVED like check 5, no list on either side: every `hsl(var(--x))`
 *      written in the sources is checked against how `--x` is declared in
 *      `src/index.css`. A variable that already holds a complete `hsl(...)`
 *      turns the usage into `hsl(hsl(...))` — invalid CSS, the declaration
 *      is dropped and the element paints nothing. Channel form is fine;
 *      a variable not declared in `src/index.css` (runtime-written) is
 *      assumed fine. Declared complete in ONE block and channels in another
 *      is broken: the worst case is the one that reaches a screen.
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
 *   - check 4 matches `setProperty("--x"` literally. A template literal, a
 *     computed name, or a loop over an object would slip past it. It holds
 *     today because MaterialYouProvider writes every variable by name;
 *   - check 5 reads class names written literally in the sources. A dynamic
 *     name (`bg-chart-${k}`, a helper that concatenates) is invisible to it —
 *     and to Tailwind's own scanner, which would not emit it either: such
 *     code is broken before it reaches this gate, but the gate cannot say so;
 *   - variant usages (`dark:bg-chart-x`, `hover:…`), the `!` important marker
 *     and the arbitrary-alpha form (`/[0.13]`) are matched through the
 *     escaped selector lookup shared by checks 2 and 5, so none of them
 *     reads as a false red. New variant syntaxes Tailwind may add are
 *     untested;
 *   - check 5 has no prefix list: ANY `<prefix>-chart-<name>` token counts
 *     as a utility claim. A non-utility token containing `-chart-` would be
 *     scanned too — none exists in the sources today, and if one ever does,
 *     it fails loudly at its own file:line instead of passing silently;
 *   - comment lines are recognised by their START (`*`, `//`, `/*`, `{/*`):
 *     the continuation lines of a multi-line `{/* … ` JSX block are still
 *     scanned, so a chart utility written mid-block would count as code.
 *     Check 6 shares this limit — and note that `src/index.css` itself
 *     documents the pattern inside CSS comments, which is why its comments
 *     are stripped before its declarations are parsed;
 *   - check 6 reads declarations from `src/index.css` only: a variable
 *     written exclusively at runtime (the `--m3-*` family, set by
 *     MaterialYouProvider with bare channel values) is invisible to it and
 *     passes on trust. Usages inside `index.css` itself are not scanned
 *     (the source scan is `.ts/.tsx` — today the only two `hsl(var(--…))`
 *     strings in that file sit inside comments), and neither a fallback
 *     form `hsl(var(--x, …))` nor a name built dynamically would match.
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
  // Semantic chart palette — the classes the coach surfaces actually use.
  // Check 5 below catches ANY chart-* utility without a rule; these entries
  // additionally pin each class to the variable it must read.
  "bg-chart-volume/10": "--chart-volume",
  "bg-chart-volume/20": "--chart-volume",
  "text-chart-volume": "--chart-volume",
  "bg-chart-frequency/10": "--chart-frequency",
  "text-chart-frequency": "--chart-frequency",
  "bg-chart-fatigue/10": "--chart-fatigue",
  "text-chart-fatigue": "--chart-fatigue",
  "bg-chart-load/10": "--chart-load",
  "text-chart-load": "--chart-load",
  "bg-chart-velocity/10": "--chart-velocity",
  "text-chart-velocity": "--chart-velocity",
  "bg-chart-power/10": "--chart-power",
  "text-chart-power": "--chart-power",
  "bg-chart-intensity/20": "--chart-intensity",
  "text-chart-intensity": "--chart-intensity",
  "bg-chart-acwr-low": "--chart-acwr-low",
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
  "--chart-volume",
  "--chart-intensity",
  "--chart-fatigue",
  "--chart-grid",
  "--chart-axis",
  "--chart-muted",
  "--chart-calories",
  "--chart-weight",
  "--chart-frequency",
  "--chart-load",
  "--chart-velocity",
  "--chart-power",
  "--chart-acwr-low",
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
/**
 * The rule a class produced in the built CSS, or null — the ONE selector
 * matcher, shared by check 2 and check 5 so they cannot disagree. The class
 * arrives escaped the way Tailwind writes selectors (`/`→`\/`, `!`→`\!`,
 * `[`→`\[`, `.`→`\.`) and possibly behind a variant prefix: `dark:bg-chart-x`
 * is emitted as `.dark\:bg-chart-x:is(.dark *)`. So the class must appear
 * preceded by `.` OR by an escaped variant `\:` — never require a bare
 * `.cls{`, which would turn a correct variant usage into a false red, and a
 * red on correct code is how a gate gets removed. The trailing guard rejects
 * longer names AND any escaped continuation (`\/10`, `\[0\.13\]`), so a
 * plain class does not pass on the strength of its own tint variant.
 */
function findRule(cls) {
  const selectorText = cls.replace(/[^a-zA-Z0-9-]/g, (c) => "\\" + c);
  const quoted = selectorText.replace(/[.*+?^${}()|[\]\\/]/g, (c) => "\\" + c);
  const m = new RegExp(`[.:]${quoted}(?![\\w\\\\-])`).exec(css);
  if (!m) return null;
  const open = css.indexOf("{", m.index);
  return open === -1 ? null : css.slice(open, css.indexOf("}", open) + 1);
}

/**
 * JSDoc bodies, `//` lines and single-line JSX/JSDoc openers are
 * documentation, not code. Continuation lines of a multi-line `{/*` block
 * are NOT recognised — declared limit in the header.
 */
const isCommentLine = (trimmed) =>
  trimmed.startsWith("*") ||
  trimmed.startsWith("//") ||
  trimmed.startsWith("/*") ||
  trimmed.startsWith("{/*");

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
  const re = new RegExp(`(?<![\\w-])${cls.replace("/", "\\/")}(?![\\w-]|/\\d|/\\[)`);
  const hits = [];
  for (const file of SOURCE_FILES) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (isCommentLine(trimmed)) return;
      if (re.test(line)) hits.push(`${file.replace(/\\/g, "/")}:${i + 1}`);
    });
  }
  return hits;
}

for (const [cls, varName] of Object.entries(EXPECTED)) {
  const rule = findRule(cls);
  if (!rule) {
    failures.push(`${cls} — nessuna regola emessa`);
    continue;
  }
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

// ── 5. DERIVED: every chart-* utility in the sources has an emitted rule ───
// No list to maintain — not even of prefixes: ANY `<prefix>-chart-<name>`
// token is a colour-utility claim, so `border-t-chart-*`, `ring-offset-*`
// and whatever Tailwind adds next are covered the day someone writes them
// (a prefix list here went blind on exactly those two families — reviewed
// 2026-08-02). The extraction also carries the `!` important marker and the
// arbitrary-alpha form `/[0.13]`, because stripping either makes the lookup
// hunt a class nobody wrote.
const CHART_CLASS_RE =
  /(?<![\w-])!?[a-z][a-z0-9-]*-chart-[a-z0-9-]+(?:\/(?:\d+|\[[^\]\s]+\]))?(?![\w-])/g;

/** class → first `file:line` it was seen at, comment lines skipped. */
const chartClassSites = new Map();
for (const file of SOURCE_FILES) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (isCommentLine(trimmed)) return;
    for (const m of line.matchAll(CHART_CLASS_RE)) {
      if (!chartClassSites.has(m[0]))
        chartClassSites.set(m[0], `${file.replace(/\\/g, "/")}:${i + 1}`);
    }
  });
}

let chartEmitted = 0;
for (const [cls, site] of [...chartClassSites.entries()].sort()) {
  if (!findRule(cls)) {
    failures.push(`${cls} — scritta in ${site} ma nessuna regola emessa: la classe non esiste`);
    continue;
  }
  chartEmitted += 1;
}
console.log(
  `  ✓ check 5: ${chartEmitted}/${chartClassSites.size} utility chart-* trovate nei sorgenti hanno una regola emessa`,
);

// ── 6. DERIVED: no source wraps a complete-colour variable in hsl(var()) ───
// `hsl(var(--x))` is valid only while `--x` holds bare channels. Wrapped
// around a variable that is already a complete colour it becomes
// `hsl(hsl(…))` — the browser drops the declaration and the element paints
// nothing: the defect class of this whole gate, one wrapper earlier.
// Declarations are read from src/index.css with comments stripped (the
// documentation in that file mentions these very patterns), across every
// block that declares variables (`:root`, `.dark`, `.theme-athlete`).
const INDEX_CSS = "src/index.css";
const cssVarDecls = new Map(); // --name → every declared value, all blocks
if (existsSync(INDEX_CSS)) {
  const decommented = readFileSync(INDEX_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of decommented.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    if (!cssVarDecls.has(m[1])) cssVarDecls.set(m[1], []);
    cssVarDecls.get(m[1]).push(m[2].trim());
  }
}

// An empty map means the check would wave EVERYTHING through as
// "runtime-written" — green with zero assertions, the silent-pass failure
// mode this whole gate exists to prevent. Fail loudly instead.
if (cssVarDecls.size === 0) {
  failures.push(
    `${INDEX_CSS} — nessuna dichiarazione di variabile trovata (file mancante o vuoto): ` +
      `il check 6 non sta verificando nulla`,
  );
}

const HSL_VAR_USE = /hsl\(var\((--[a-zA-Z0-9-]+)\)/g;
let hslWrapOk = 0;
let hslWrapBroken = 0;
for (const file of SOURCE_FILES) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isCommentLine(line.trim())) return;
    for (const m of line.matchAll(HSL_VAR_USE)) {
      const name = m[1];
      const site = `${file.replace(/\\/g, "/")}:${i + 1}`;
      const decls = cssVarDecls.get(name) ?? [];
      const complete = decls.filter((v) => v.startsWith("hsl("));
      const otherNonChannel = decls.find((v) => !v.startsWith("hsl(") && !CHANNEL_FORM.test(v));
      if (complete.length > 0) {
        const mixed =
          complete.length < decls.length
            ? " — e a canali in un altro blocco: vale il caso peggiore"
            : "";
        failures.push(
          `${site} — hsl(var(${name})): ${name} è già un colore completo in ` +
            `${INDEX_CSS} («${complete[0]}»${mixed}); hsl(hsl(…)) è invalido e ` +
            `l'elemento resta senza colore — usa var(${name}) nuda`,
        );
        hslWrapBroken += 1;
      } else if (otherNonChannel !== undefined) {
        failures.push(
          `${site} — hsl(var(${name})): ${name} è dichiarata in ${INDEX_CSS} come ` +
            `«${otherNonChannel}», che non è una terna di canali: dentro hsl() produce CSS invalido`,
        );
        hslWrapBroken += 1;
      } else {
        hslWrapOk += 1; // channel form, or declared only at runtime
      }
    }
  });
}
console.log(
  `  ${hslWrapBroken === 0 ? "✓" : "✗"} check 6: ${hslWrapBroken} usi hsl(var(--x)) ` +
    `su variabile-colore completa / ${hslWrapOk} corretti`,
);

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
    `${CHANNEL_VARS.length} variabili in forma a canali e non riscritte a runtime, ` +
    `${chartClassSites.size} utility chart-* derivate dai sorgenti tutte emesse, ` +
    `${hslWrapOk} usi hsl(var(--x)) tutti su variabili a canali o scritte solo a runtime.`,
);
