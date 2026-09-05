// =============================================================================
// Cancello derivato (b) — fetta rag-una-libreria, 2026-09-05.
// Il RAG ha UNA libreria (knowledge_documents + knowledge_chunks) letta da UNA
// funzione (match_knowledge_chunks, che risolve il coach da auth.uid()).
// match_documents e coach_knowledge_base sono state rimosse dalla migrazione
// 20260905083618: nessuna edge può più nominarle, e chat-with-coach legge dalla
// libreria viva. Il cancello legge i SORGENTI (fs) di TUTTI i .ts non-test sotto
// supabase/functions — non solo gli index.ts: una lettura estratta in un modulo
// (com'è già rag/formatContext.ts) resta nel campo visivo — come gli altri pin
// sui sorgenti.
// =============================================================================
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FUNCTIONS_DIR = fileURLToPath(new URL("../../supabase/functions/", import.meta.url));

function tsSourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsSourcesUnder(full);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [full] : [];
  });
}

const rel = (full: string) => full.slice(FUNCTIONS_DIR.length).replace(/\\/g, "/");
const count = (src: string, needle: string) => src.split(needle).length - 1;

const sources = tsSourcesUnder(FUNCTIONS_DIR).map((full) => ({
  file: rel(full),
  src: readFileSync(full, "utf8"),
}));
const chatWithCoach = sources.find((e) => e.file === "chat-with-coach/index.ts");
if (!chatWithCoach) throw new Error("supabase/functions/chat-with-coach/index.ts non trovata");

describe("RAG — una libreria sola, una funzione sola", () => {
  it("il cancello vede le edge (chat-with-coach e ask-copilot comprese) e i loro moduli", () => {
    const files = sources.map((e) => e.file);
    expect(files).toContain("chat-with-coach/index.ts");
    expect(files).toContain("ask-copilot/index.ts");
    expect(files).toContain("chat-with-coach/rag/formatContext.ts");
    expect(files.filter((f) => f.endsWith(".test.ts"))).toEqual([]);
  });

  it("nessun sorgente delle edge nomina match_documents — la funzione non esiste più", () => {
    const offenders = sources.filter((e) => count(e.src, "match_documents") > 0).map((e) => e.file);
    expect(
      offenders,
      "match_documents è stata rimossa (migrazione 20260905083618): una chiamata fallirebbe a runtime",
    ).toEqual([]);
  });

  it('chat-with-coach chiama rpc("match_knowledge_chunks" almeno una volta', () => {
    expect(count(chatWithCoach.src, 'rpc("match_knowledge_chunks"')).toBeGreaterThanOrEqual(1);
  });

  it("chat-with-coach non passa più il coach come parametro (p_coach_id): lo risolve la funzione da auth.uid()", () => {
    expect(count(chatWithCoach.src, "p_coach_id")).toBe(0);
  });

  it("chat-with-coach formatta il contesto con la funzione pura rag/formatContext.ts (testata in Deno)", () => {
    expect(chatWithCoach.src).toMatch(/from "\.\/rag\/formatContext\.ts"/);
    expect(count(chatWithCoach.src, "formatContext(")).toBeGreaterThanOrEqual(1);
  });
});
