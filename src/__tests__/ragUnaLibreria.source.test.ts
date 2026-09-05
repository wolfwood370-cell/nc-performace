// =============================================================================
// Cancello derivato (b) — fetta rag-una-libreria, 2026-09-05 (+ coda: il
// fail-loud della edge è inchiodato).
// Il RAG ha UNA libreria (knowledge_documents + knowledge_chunks) letta da UNA
// funzione (match_knowledge_chunks, che risolve il coach da auth.uid()).
// match_documents e coach_knowledge_base sono state rimosse dalla migrazione
// 20260905083618: nessuna edge può più nominarle, e chat-with-coach legge dalla
// libreria viva — e quando NON può leggerla risponde 500, mai «proseguo senza
// contesto» (misura di Cowork del 05/09: `if (matchError)` → `if (false)`
// lasciava i cinque test verdi). Il cancello legge i SORGENTI (fs) di TUTTI i
// .ts non-test sotto supabase/functions — non solo gli index.ts: una lettura
// estratta in un modulo (com'è già rag/formatContext.ts) resta nel campo
// visivo — come gli altri pin sui sorgenti.
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

/** Indice della graffa che chiude quella aperta in `open` (contando le graffe). */
function graffaCheChiude(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Graffe aperte meno chiuse in `src[from, to)`: 0 = stesso livello di annidamento. */
const profondita = (src: string, from: number, to: number): number =>
  count(src.slice(from, to), "{") - count(src.slice(from, to), "}");

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

  it("la lettura della libreria fallisce forte: dopo la RPC il ramo matchError con un 500 e un return incondizionato, e nessuna via al contesto che non passi di lì", () => {
    // La edge non ha test suoi: questo lega il suo sorgente al fail-loud, con
    // lo stampo della guardia isEmptyWeek (02/09). I commenti — a blocco E a
    // riga intera — sono tolti prima di leggere: un ramo che sopravvive solo in
    // un commento non è un ramo. La posizione si verifica contro la STRUTTURA
    // (graffe contate), non contro un indice; e i due tratti «fra la RPC e il
    // ramo» e «fra il ramo e il contesto» hanno una sagoma esatta — lì non
    // c'è NULLA — così né un `.then` che normalizzi l'errore, né uno shadow di
    // matchError, né un commento o un template literal che sbilanci le graffe
    // trovano posto (passata indipendente del 05/09).
    const edge = chatWithCoach.src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    // Una RPC sola, e il suo errore destrutturato proprio lì.
    expect(count(edge, 'rpc("match_knowledge_chunks"'), "una sola RPC match_knowledge_chunks").toBe(
      1,
    );
    const rpc = edge.indexOf('rpc("match_knowledge_chunks"');
    expect(
      edge.slice(Math.max(0, rpc - 80), rpc),
      "l'errore della RPC non è destrutturato in matchError",
    ).toMatch(/const \{ data: matches, error: matchError \} = await supabase\.$/);

    // La RPC vive nel corpo dell'handler (serve + try): non in una funzione
    // annidata, il cui return del 500 verrebbe scartato fuori; e nel file non
    // c'è alcun `finally` né `try` etichettato, che scarterebbero ogni return.
    const handlerOpen = "serve(async (req) => {";
    const handler = edge.indexOf(handlerOpen);
    expect(handler, "handler serve(async (req) => { non trovato").toBeGreaterThan(-1);
    expect(edge.slice(handler + handlerOpen.length, rpc)).not.toMatch(/=>|\bfunction\b/);
    expect(
      profondita(edge, handler, rpc),
      "la RPC non sta al livello dell'handler (serve + try)",
    ).toBe(2);
    expect(edge).not.toMatch(/\bfinally\b|^\s*\w+:\s*try\b/m);

    const ramo = edge.indexOf("if (matchError) {", rpc);
    expect(
      ramo,
      "fail-loud assente: dopo la RPC la edge non controlla `if (matchError)` — proseguirebbe senza contesto",
    ).toBeGreaterThan(rpc);

    // Fra la RPC e il ramo: SOLO la chiamata, i suoi argomenti, `);` e spazi.
    const primaDelRamo = edge.slice(rpc, ramo);
    expect(primaDelRamo, "fra la RPC e il ramo matchError deve esserci solo la chiamata").toMatch(
      /^rpc\("match_knowledge_chunks",\s*\{[^{}]*\}\s*\);\s*$/,
    );
    expect(
      profondita(edge, rpc, ramo),
      "il ramo matchError non è allo stesso livello della RPC",
    ).toBe(0);

    // Il corpo del ramo, dalla sua graffa a quella che la chiude: un 500 e un
    // return INCONDIZIONATO al livello del ramo — nessun if/else/ternario/try/
    // switch, nessun loop o funzione che lo annidi, nessun commento o template
    // literal che sbilanci le graffe.
    const apertura = edge.indexOf("{", ramo);
    const chiusura = graffaCheChiude(edge, apertura);
    expect(chiusura, "la graffa del ramo matchError non si chiude").toBeGreaterThan(apertura);
    const corpo = edge.slice(apertura + 1, chiusura);
    expect(corpo, "il ramo matchError non risponde 500").toContain("status: 500");
    expect(corpo, "il ramo matchError non usa il messaggio esplicito").toContain(
      "KNOWLEDGE_BASE_ERROR",
    );
    expect(count(corpo, "return new Response("), "un return solo, e incondizionato").toBe(1);
    const ritorno = corpo.indexOf("return new Response(");
    expect(
      profondita(corpo, 0, ritorno),
      "il return non sta al livello del ramo (loop, arrow o blocco annidato)",
    ).toBe(0);
    expect(corpo).not.toMatch(
      /\bif\s*\(|\belse\b|\?|\btry\b|\bswitch\b|\bwhile\b|\bfor\b|\bdo\b|=>|\bfunction\b|`|\/\/|\/\*/,
    );
    expect(
      edge.slice(chiusura + 1, chiusura + 16),
      "un else dopo il ramo: il return non è più l'unica uscita",
    ).not.toMatch(/^\s*else\b/);

    // Dopo la chiusura del ramo, SUBITO il contesto — costruito dai match di
    // QUELLA RPC, una volta sola nel file, allo stesso livello: chi arriva al
    // contesto è passato dal controllo dell'errore.
    const contesto = edge.indexOf("formatContext(", rpc);
    expect(contesto, "il contesto non viene costruito dopo la RPC").toBeGreaterThan(-1);
    expect(
      contesto,
      "il contesto si costruisce PRIMA che il ramo matchError si chiuda",
    ).toBeGreaterThan(chiusura);
    expect(
      edge.slice(chiusura + 1, contesto),
      "fra la chiusura del ramo e il contesto deve esserci solo `const contextChunks = `",
    ).toMatch(/^\s*const contextChunks = $/);
    expect(edge.slice(contesto), "il contesto si costruisce dai match della RPC").toMatch(
      /^formatContext\(\(matches as KnowledgeMatch\[\] \| null\) \?\? \[\]\)/,
    );
    expect(count(edge, "formatContext("), "una via sola al contesto in tutto il file").toBe(1);
    expect(profondita(edge, rpc, contesto), "il contesto non è allo stesso livello della RPC").toBe(
      0,
    );
  });
});
