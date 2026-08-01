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
  try {
    p = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const event = p.hook_event_name || "";
  const tool = p.tool_name || "";
  const input = p.tool_input || {};
  try {
    if (event === "PreToolUse") preToolUse(tool, input);
    else if (event === "PostToolUse") postToolUse(tool, input);
  } catch {
    /* non bloccare mai per un errore interno dell'hook */
  }
  process.exit(0);
});

function block(msg) {
  console.error(msg);
  process.exit(2);
}

function preToolUse(tool, input) {
  if (tool === "Bash") {
    const cmd = String(input.command || "");
    // Message-aware: svuota i contenuti tra apici (es. il messaggio di `git commit -m "..."`)
    // così un messaggio che cita git push / --force / rm -rf NON genera falsi positivi.
    const cmdReal = cmd.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");

    // Legge #8 (rivista 2026-08-01 — repo nell'org, ruleset server su main):
    // push consentito SOLO verso rami claude/*; il merge in main passa da
    // una PR. Force e cancellazioni restano bloccati su qualunque ramo.
    // Il ruleset server protegge comunque main, ma l'hook non delega.
    const gitPushRe =
      /\bgit((?:\s+-[Cc]\s+\S+|\s+--(?:git-dir|work-tree|exec-path)=\S+)*)\s+push\b([^&|;]*)/g;
    let pm;
    while ((pm = gitPushRe.exec(cmdReal))) {
      const args = pm[2] || "";
      if (/(^|\s)(--force(-with-lease)?(=\S+)?|-f)(\s|$)/.test(args) || /\s\+\S+/.test(args))
        block("⛔ push --force bloccato su qualunque ramo (CLAUDE.md legge #8).");
      if (/(^|\s)(--delete|-d)(\s|$)/.test(args) || /\s:\S+/.test(args))
        block("⛔ push di cancellazione bloccato (CLAUDE.md legge #8).");
      // Token posizionali: [0] = remote, dal [1] in poi i refspec (dst dopo ":").
      const words = args.trim().split(/\s+/).filter(Boolean);
      const positional = [];
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (w === "--") {
          positional.push(...words.slice(i + 1));
          break;
        }
        if (/^\d*[<>]/.test(w)) continue; // redirezioni (2>, >file, …)
        if (w.startsWith("-")) {
          if (/^(-o|--push-option|--repo|--receive-pack|--exec)$/.test(w)) i++; // flag con valore separato
          continue;
        }
        positional.push(w);
      }
      const refspecs = positional.slice(1);
      if (refspecs.length > 0) {
        for (const rs of refspecs) {
          const dst = (rs.includes(":") ? rs.slice(rs.lastIndexOf(":") + 1) : rs).replace(
            /^refs\/heads\//,
            "",
          );
          if (!/^claude\//.test(dst))
            block(
              "⛔ push verso «" +
                dst +
                "» bloccato: consentiti solo rami claude/* (CLAUDE.md legge #8).",
            );
        }
      } else {
        // Push nudo: la stringa del comando non dice la destinazione — è la
        // forma da cui erano passati i 14 commit diretti su main. Si risolve
        // il ramo corrente del checkout in cui gira l'hook e si rifiuta se
        // non è claude/*. Fail-closed: nel checkout principale HEAD è main,
        // quindi il push nudo resta di fatto vietato; dai worktree si pusha
        // con refspec esplicito.
        let cur = "";
        try {
          cur = execSync("git rev-parse --abbrev-ref HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
          })
            .toString()
            .trim();
        } catch {
          /* resta "" → blocco */
        }
        if (!/^claude\//.test(cur))
          block(
            "⛔ git push nudo dal ramo «" +
              (cur || "sconosciuto") +
              "» bloccato: consentiti solo rami claude/* (CLAUDE.md legge #8).",
          );
      }
    }

    // Distruttivi
    if (/\brm\s+-rf\s+(\/|~|\$HOME|\.\.(\/|$))/.test(cmdReal))
      block("⛔ rm -rf su percorso pericoloso bloccato. Eseguilo tu manualmente se davvero serve.");
    // Belt di riserva sul force: copre forme di push che il parser sopra
    // non riconoscesse come `git push`.
    if (/--force\b/.test(cmdReal) && /\bpush\b/.test(cmdReal))
      block("⛔ push --force bloccato (CLAUDE.md legge #8).");

    // Legge #3 — build gate verde PRIMA del commit
    if (/\bgit\s+commit\b/.test(cmdReal)) {
      try {
        execSync("npx tsc --noEmit -p tsconfig.app.json", { stdio: ["ignore", "ignore", "pipe"] });
      } catch (e) {
        const out = (
          (e.stderr && e.stderr.toString()) ||
          (e.stdout && e.stdout.toString()) ||
          ""
        ).slice(-3000);
        block(
          "⛔ Build gate fallito: `tsc --noEmit -p tsconfig.app.json` non è verde. Correggi prima di committare.\n" +
            out,
        );
      }
    }
    return;
  }

  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    const fp = String(input.file_path || "").replace(/\\/g, "/");
    // Carve-out: .env.example is a names-only template tracked in the repo —
    // the guard stays intact for every real env file (.env, .env.local, ...).
    const isEnvExample = /(^|\/)\.env\.example$/.test(fp);
    if ((/(^|\/)\.env(\.[^/]+)?$/.test(fp) && !isEnvExample) || /(^|\/)\.mcp\.json$/.test(fp))
      block(
        "⛔ Scrittura su " +
          fp +
          " bloccata: credenziali/secrets/env li gestisci tu (CLAUDE.md §5).",
      );
    return;
  }
}

function postToolUse(tool, input) {
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    const fp = String(input.file_path || "");
    if (/\.(ts|tsx|css)$/.test(fp)) {
      try {
        execSync("npx prettier --write " + JSON.stringify(fp), { stdio: "ignore" });
      } catch {
        /* best-effort */
      }
    }
  }
}
