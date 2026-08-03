/**
 * scripts/audit-gate.mjs
 * ---------------------------------------------------------------------------
 * Supply-chain gate: `npm audit` with DECLARED exceptions, replacing a blind
 * `npm audit --audit-level=high`. The old gate could only lie in one of two
 * directions: stay red forever for an advisory whose attack surface does not
 * exist in this app, or go green by silence if the level was lowered. This
 * gate does neither:
 *
 *   RED   if the audit did not actually run (no data is never green);
 *   RED   for any high/critical advisory NOT listed in .audit-allowlist.json;
 *   RED   for any exception past its reviewBy date ("scaduta");
 *   RED   for any exception whose code precondition fell — its
 *         invalidIfMatches pattern found in the invalidIfIn files
 *         ("premessa caduta");
 *   RED   for any exception matching no open advisory ("eccezione morta");
 *   GREEN otherwise, PRINTING every applied exception with its reason and
 *         deadline: a green gate must say what it let through.
 *
 * Every entry must carry ALL of: ghsa, packages, reason, addedOn, reviewBy,
 * invalidIfMatches, invalidIfIn. An exception without a deadline is a
 * permanent hole; one without a kill-switch is an unfalsifiable claim. The
 * gate enforces the shape so discipline does not have to.
 *
 * Declared limits:
 *   - Requires a reachable registry: npm's own failures (ENOTFOUND, ENOLOCK,
 *     ...) come back as valid JSON with an `error` key and are RED with that
 *     detail in the message. A new advisory published tomorrow can turn main
 *     red with no code change — that is the gate telling the truth.
 *   - SYMMETRIC AND INTENDED: an advisory that gets FIXED turns this gate
 *     red on the very PR that fixes it, until that same PR deletes the dead
 *     exception. Remove the entry in the same commit as the dependency bump.
 *   - `packages` is documentation, never matched against the report: npm's
 *     JSON attaches the advisory object only to the source package, not to
 *     dependents reached through the chain. Matching is by GHSA only.
 *   - invalidIfIn understands exactly one pattern shape (see listFiles):
 *     a base directory, a recursive descent, and an extension list. Any
 *     other shape is RED, not silently skipped.
 *   - The CI job that runs this has NO node_modules: stdlib only, keep it so.
 *
 * Usage: node scripts/audit-gate.mjs   (exit 0 = green, anything else = red)
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_FILE = join(ROOT, ".audit-allowlist.json");
const REQUIRED_FIELDS = [
  "ghsa",
  "packages",
  "reason",
  "addedOn",
  "reviewBy",
  "invalidIfMatches",
  "invalidIfIn",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BLOCKING = new Set(["high", "critical"]);

// ── 1. Run the audit. Its exit code is non-zero by construction whenever
//      vulnerabilities exist, so it proves nothing: only the JSON does.
const res = spawnSync("npm audit --json", {
  cwd: ROOT,
  shell: true,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(res.stdout ?? "");
} catch {
  console.error(
    "audit-gate ROSSO: l'audit non è girato — stdout non è JSON (output troncato o corrotto).",
  );
  if (res.stderr?.trim()) console.error(res.stderr.trim());
  process.exit(1);
}
if (
  typeof report !== "object" ||
  report === null ||
  typeof report.vulnerabilities !== "object" ||
  report.vulnerabilities === null
) {
  // npm reports its own failures as VALID JSON with an `error` key — a
  // parse-only guard would mistake "npm could not audit" for data.
  const detail =
    report?.error?.code ||
    report?.error?.summary ||
    report?.message ||
    "nessun dettaglio nel JSON di npm";
  console.error(`audit-gate ROSSO: l'audit non è girato — ${detail}`);
  process.exit(1);
}

// ── 2. Collect open advisories: the OBJECT elements of via[] (string
//      elements are chain references to another vulnerable package).
const advisories = new Map(); // ghsa -> { ghsa, severity, title, packages:Set }
for (const [pkgName, vuln] of Object.entries(report.vulnerabilities)) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object" || via === null) continue;
    const match = String(via.url ?? "").match(/GHSA(?:-[a-z0-9]{4}){3}/i);
    const key = match ? match[0] : `advisory-senza-GHSA(source:${via.source ?? "?"})`;
    const entry = advisories.get(key) ?? {
      ghsa: key,
      severity: String(via.severity ?? "sconosciuta"),
      title: String(via.title ?? ""),
      packages: new Set(),
    };
    entry.packages.add(String(via.name ?? pkgName));
    advisories.set(key, entry);
  }
}
const blocking = [...advisories.values()].filter((a) => BLOCKING.has(a.severity));

// ── 3. Load the allowlist. A malformed allowlist is RED: the gate enforces
//      the exception shape (reason + deadline + kill-switch), not discipline.
let allowlist;
try {
  allowlist = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
} catch (err) {
  console.error(`audit-gate ROSSO: .audit-allowlist.json illeggibile — ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(allowlist)) {
  console.error("audit-gate ROSSO: .audit-allowlist.json deve essere un array di voci.");
  process.exit(1);
}

const failures = [];
const notes = [];
const validEntries = [];
for (const [i, entry] of allowlist.entries()) {
  const missing = REQUIRED_FIELDS.filter(
    (f) => entry?.[f] === undefined || entry[f] === null || entry[f] === "",
  );
  if (missing.length > 0) {
    failures.push(
      `voce ${i} (${entry?.ghsa ?? "senza ghsa"}): campi mancanti [${missing.join(", ")}] — ` +
        "un'eccezione senza perché, scadenza o interruttore non è ammessa",
    );
    continue;
  }
  const badDates = ["addedOn", "reviewBy"].filter((f) => !DATE_RE.test(String(entry[f])));
  if (badDates.length > 0 || !Array.isArray(entry.packages)) {
    for (const f of badDates)
      failures.push(`voce ${entry.ghsa}: ${f} "${entry[f]}" non è una data YYYY-MM-DD`);
    if (!Array.isArray(entry.packages))
      failures.push(`voce ${entry.ghsa}: packages deve essere un array`);
    continue;
  }
  validEntries.push(entry);
}

// ── 4. The four checks. All failures are collected before the single exit:
//      whoever reads a red gate should read the whole truth at once.
const declared = new Set(validEntries.map((e) => e.ghsa));

// (d) undeclared high/critical advisories
for (const adv of blocking) {
  if (!declared.has(adv.ghsa)) {
    failures.push(
      `vulnerabilità ${adv.severity} NON dichiarata: ${adv.ghsa} ` +
        `[${[...adv.packages].join(", ")}] — ${adv.title}`,
    );
  }
}

const today = new Date().toISOString().slice(0, 10);
for (const entry of validEntries) {
  // (e) expired review date
  if (entry.reviewBy < today) {
    failures.push(
      `eccezione ${entry.ghsa} scaduta il ${entry.reviewBy}: rinnova la data con un perché ` +
        "aggiornato, oppure togli la voce",
    );
  }
  // (f) fallen precondition: the kill-switch pattern appears in the sources
  let hits = null;
  try {
    hits = scanForPattern(entry.invalidIfMatches, entry.invalidIfIn);
  } catch (err) {
    failures.push(`eccezione ${entry.ghsa}: interruttore non valutabile — ${err.message}`);
  }
  if (hits !== null && hits.length > 0) {
    const shown = hits.slice(0, 5).join(", ");
    const extra = hits.length > 5 ? ` e altri ${hits.length - 5}` : "";
    failures.push(
      `premessa caduta per ${entry.ghsa}: /${entry.invalidIfMatches}/ compare in ` +
        `${shown}${extra} — l'eccezione non vale più`,
    );
  }
  // (g) dead exception: no open advisory matches it any more
  if (!advisories.has(entry.ghsa)) {
    failures.push(
      `eccezione morta: ${entry.ghsa} non corrisponde più a nessuna advisory aperta — ` +
        "togli questa voce NELLO STESSO commit che risolve l'advisory (finché resta, " +
        "questo cancello tiene rossa proprio la PR che la risolve)",
    );
  } else if (!BLOCKING.has(advisories.get(entry.ghsa).severity)) {
    notes.push(
      `voce ${entry.ghsa}: advisory declassata a "${advisories.get(entry.ghsa).severity}", ` +
        "non più bloccante — la voce può essere tolta",
    );
  }
}

// ── 5. Verdict.
if (failures.length > 0) {
  console.error(`audit-gate ROSSO — ${failures.length} problema/i:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

const applied = validEntries.filter((e) => blocking.some((a) => a.ghsa === e.ghsa));
const belowThreshold = [...advisories.values()].filter((a) => !BLOCKING.has(a.severity));
console.log(
  `audit-gate VERDE: 0 vulnerabilità high/critical non dichiarate ` +
    `(${blocking.length} high/critical dichiarate, ${belowThreshold.length} sotto-soglia).`,
);
for (const e of applied) {
  console.log(`  ECCEZIONE APPLICATA: ${e.ghsa} [${e.packages.join(", ")}]`);
  console.log(`    perché: ${e.reason}`);
  console.log(`    scadenza: ${e.reviewBy} (aggiunta il ${e.addedOn})`);
  console.log(
    `    interruttore: /${e.invalidIfMatches}/ assente da ${e.invalidIfIn} — verificato in questo run`,
  );
}
for (const n of notes) console.log(`  nota: ${n}`);

// ---------------------------------------------------------------------------

/** Files matched by the ONE supported pattern shape: base dir + recursive
 *  descent + extension set (e.g. src, any depth, .ts/.tsx). Anything else
 *  throws — a limit the caller turns into a red gate, never a silent skip. */
function listFiles(pattern) {
  const m = String(pattern).match(/^([^*?{}\\]+)\/\*\*\/\*\.(?:\{([^}]+)\}|([A-Za-z0-9]+))$/);
  if (m === null) {
    throw new Error(
      `pattern "${pattern}" non supportato (forma attesa: <dir>, discesa ricorsiva, ` +
        "estensioni tipo *.{ts,tsx} — limite dichiarato nell'header)",
    );
  }
  const exts = (m[2] ? m[2].split(",") : [m[3]]).map((e) => `.${e.trim()}`);
  const out = [];
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (exts.some((x) => d.name.endsWith(x))) out.push(p);
    }
  };
  walk(join(ROOT, m[1]));
  return out;
}

/** file:line hits of `regexSrc` across the files of `filePattern`. */
function scanForPattern(regexSrc, filePattern) {
  const re = new RegExp(regexSrc);
  const hits = [];
  for (const file of listFiles(filePattern)) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) hits.push(`${relative(ROOT, file).replaceAll("\\", "/")}:${i + 1}`);
    }
  }
  return hits;
}
