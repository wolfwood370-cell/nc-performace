// nc-performance-hub — Claude Code project hooks
// Cross-platform (Node, funziona anche su Windows). Eseguito da .claude/settings.json.
// Riceve su stdin il JSON dell'evento CC (hook_event_name, tool_name, tool_input).
// Convenzione: exit 2 = BLOCCA + manda stderr a Claude; exit 0 = procedi.
// Assume cwd = root del repo (default di CC).
import { execSync } from "node:child_process";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let p = {};
  try { p = JSON.parse(raw); } catch { process.exit(0); }
  const event = p.hook_event_name || "";
  const tool = p.tool_name || "";
  const input = p.tool_input || {};
  try {
    if (event === "PreToolUse") preToolUse(tool, input);
    else if (event === "PostToolUse") postToolUse(tool, input);
  } catch { /* non bloccare mai per un errore interno dell'hook */ }
  process.exit(0);
});

function block(msg) {
  console.error(msg);
  process.exit(2);
}

function preToolUse(tool, input) {
  if (tool === "Bash") {
    const cmd = String(input.command || "");

    // Legge #8 — MAI push: sincronizzi tu via GitHub Desktop
    if (/\bgit\s+push\b/.test(cmd))
      block("⛔ git push bloccato: la sincronizzazione la fai tu via GitHub Desktop (CLAUDE.md legge #8).");

    // Distruttivi
    if (/\brm\s+-rf\s+(\/|~|\$HOME|\.\.(\/|$))/.test(cmd))
      block("⛔ rm -rf su percorso pericoloso bloccato. Eseguilo tu manualmente se davvero serve.");
    if (/--force\b/.test(cmd) && /\bpush\b/.test(cmd))
      block("⛔ push --force bloccato (CLAUDE.md legge #8).");

    // Legge #3 — build gate verde PRIMA del commit
    if (/\bgit\s+commit\b/.test(cmd)) {
      try {
        execSync("npx tsc --noEmit -p tsconfig.app.json", { stdio: ["ignore", "ignore", "pipe"] });
      } catch (e) {
        const out = ((e.stderr && e.stderr.toString()) || (e.stdout && e.stdout.toString()) || "").slice(-3000);
        block("⛔ Build gate fallito: `tsc --noEmit -p tsconfig.app.json` non è verde. Correggi prima di committare.\n" + out);
      }
    }
    return;
  }

  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    const fp = String(input.file_path || "").replace(/\\/g, "/");
    if (/(^|\/)\.env(\.[^/]+)?$/.test(fp) || /(^|\/)\.mcp\.json$/.test(fp))
      block("⛔ Scrittura su " + fp + " bloccata: credenziali/secrets/env li gestisci tu (CLAUDE.md §5).");
    return;
  }
}

function postToolUse(tool, input) {
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    const fp = String(input.file_path || "");
    if (/\.(ts|tsx|css)$/.test(fp)) {
      try { execSync("npx prettier --write " + JSON.stringify(fp), { stdio: "ignore" }); } catch { /* best-effort */ }
    }
  }
}
