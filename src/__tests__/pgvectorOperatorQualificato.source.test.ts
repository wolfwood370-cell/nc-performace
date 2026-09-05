// =============================================================================
// Cancello derivato (a) — fetta rag-una-libreria, 2026-09-05.
// Ogni migrazione da questa fetta in poi che misura una distanza di pgvector
// la scrive QUALIFICATA sullo schema `extensions`: l'operatore come
// `OPERATOR(extensions.<=>)` (coseno; `<->` L2, `<#>` prodotto interno) e la
// forma-funzione come `extensions.cosine_distance(…)` (l2_distance,
// inner_product, l1_distance). Perché: operatori e funzioni di pgvector vivono
// nello schema `extensions`, e 20260525120100_security_advisor_definer_hardening.sql
// pinna `search_path = public, pg_temp` su OGNI SECURITY DEFINER — una forma
// nuda dentro una funzione così muore in produzione con 42883 «operator/function
// does not exist» (misura di Cowork del 02/09: match_knowledge_chunks e
// match_documents rotte dal 25/05). Una sola grafia riconosciuta, minuscola e
// senza spazi: una grafia diversa ma valida (OPERATOR(EXTENSIONS.<=>),
// OPERATOR( extensions.<=> )) viene segnalata come nuda — falso positivo, il
// lato sicuro: si riscrive. Il cancello legge i SORGENTI (fs), come gli altri
// test «determinismo del modulo puro»: niente DB, niente runtime.
// =============================================================================
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

/** La migrazione di questa fetta: da qui in poi la regola vale. */
export const RAG_UNA_LIBRERIA_MIGRATION = "20260905083618_rag_una_libreria.sql";

/**
 * Soglia del cancello = il timestamp della migrazione di questa fetta.
 * Le due migrazioni storiche con l'operatore nudo — 20260215160406
 * (match_documents) e 20260430125629 (match_knowledge_chunks) — sono APPLICATE
 * sul DB e non si riscrivono (03-BACKEND-SUPABASE §8.2: mai amendare una
 * migration applicata, correzione in avanti); la correzione in avanti è
 * proprio la migrazione alla soglia.
 */
export const OPERATOR_GATE_FROM_TIMESTAMP = RAG_UNA_LIBRERIA_MIGRATION.slice(0, 14);

/** Il nome che la CLI Supabase applica E che il cancello sa classificare. */
const MIGRATION_FILENAME = /^\d{14}_.+\.sql$/;

/** `<=>`, `<->` o `<#>` NON preceduti da `OPERATOR(extensions.`. */
const NAKED_PGVECTOR_OPERATOR = /(?<!OPERATOR\(extensions\.)(<=>|<->|<#>)/;
/** La forma-funzione delle stesse distanze, NON preceduta da `extensions.`. */
const NAKED_PGVECTOR_FUNCTION =
  /(?<!extensions\.)\b(cosine_distance|l2_distance|inner_product|l1_distance)\s*\(/;

const allMigrations = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort();

const migrationsAtOrAfterThreshold = (): string[] =>
  allMigrations().filter((f) => f.slice(0, 14) >= OPERATOR_GATE_FROM_TIMESTAMP);

function nakedOccurrences(file: string): string[] {
  const lines = readFileSync(MIGRATIONS_DIR + file, "utf8").split(/\r?\n/);
  const hits: string[] = [];
  lines.forEach((line, i) => {
    const m = NAKED_PGVECTOR_OPERATOR.exec(line) ?? NAKED_PGVECTOR_FUNCTION.exec(line);
    if (m) hits.push(`${file}:${i + 1} — \`${m[1]}\` nudo: ${line.trim()}`);
  });
  return hits;
}

describe("pgvector: dalla soglia in poi ogni distanza è qualificata sullo schema extensions", () => {
  it("ogni file di supabase/migrations/ ha il nome che il cancello sa classificare (14 cifre_nome.sql)", () => {
    const nonConformi = allMigrations().filter((f) => !MIGRATION_FILENAME.test(f));
    expect(
      nonConformi,
      "la CLI applicherebbe questi file ma il cancello non saprebbe se stanno sopra o sotto soglia:\n" +
        nonConformi.join("\n"),
    ).toEqual([]);
  });

  it("la soglia è il timestamp della migrazione di questa fetta, e quella migrazione esiste", () => {
    expect(OPERATOR_GATE_FROM_TIMESTAMP).toMatch(/^\d{14}$/);
    expect(
      migrationsAtOrAfterThreshold(),
      `${RAG_UNA_LIBRERIA_MIGRATION} non è in supabase/migrations/: il cancello scandirebbe il nulla`,
    ).toContain(RAG_UNA_LIBRERIA_MIGRATION);
  });

  it("nessuna migrazione con timestamp ≥ soglia contiene <=>, <-> o <#> nudi, né cosine_distance(…) e sorelle non qualificate (file e riga)", () => {
    const offenders = migrationsAtOrAfterThreshold().flatMap(nakedOccurrences);
    expect(
      offenders,
      "distanza pgvector NUDA in una migrazione sopra soglia — dentro una SECURITY DEFINER con " +
        "search_path = public, pg_temp muore con 42883. Scrivila ESATTAMENTE `OPERATOR(extensions.<=>)` " +
        "(minuscolo, senza spazi: l'unica grafia che il cancello riconosce) o `extensions.cosine_distance(…)`:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("la migrazione di questa fetta: 3 operatori qualificati (SELECT, WHERE, ORDER BY), search_path pinnato, ACL esplicita, i due DROP in coda", () => {
    const sql = readFileSync(MIGRATIONS_DIR + RAG_UNA_LIBRERIA_MIGRATION, "utf8");
    // Il corpo plpgsql fra `AS $$` e `$$;` — il commento di testa nomina
    // l'operatore qualificato una volta e non conta.
    const body = /AS \$\$([\s\S]*?)\$\$;/.exec(sql)?.[1];
    expect(body, "corpo di match_knowledge_chunks (AS $$ … $$;) non trovato").toBeDefined();
    const qualified = body!.match(/OPERATOR\(extensions\.<=>\)/g) ?? [];
    expect(
      qualified,
      "il corpo di match_knowledge_chunks usa il coseno in tre punti: SELECT, WHERE, ORDER BY",
    ).toHaveLength(3);
    expect(body, "nel corpo non resta alcun operatore nudo").not.toMatch(NAKED_PGVECTOR_OPERATOR);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);

    // L'ordine dei tre passi: (a) la funzione, (b) l'ACL, (c) i DROP — il
    // DROP TABLE preceduto dal cancello che pretende la tabella ancora vuota.
    const at = (needle: RegExp) => {
      const i = sql.search(needle);
      expect(i, `${needle} assente dalla migrazione`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const iCreate = at(/CREATE OR REPLACE FUNCTION public\.match_knowledge_chunks\(/);
    const iRevoke = at(
      /REVOKE EXECUTE ON FUNCTION public\.match_knowledge_chunks\(extensions\.vector, double precision, integer\) FROM PUBLIC, anon;/,
    );
    const iGrant = at(
      /GRANT EXECUTE ON FUNCTION public\.match_knowledge_chunks\(extensions\.vector, double precision, integer\) TO authenticated, service_role;/,
    );
    const iDropFn = at(
      /DROP FUNCTION public\.match_documents\(extensions\.vector, uuid, double precision, integer\);/,
    );
    const iGuard = at(
      /IF EXISTS \(SELECT 1 FROM public\.coach_knowledge_base\) THEN\s+RAISE EXCEPTION/,
    );
    const iDropTable = at(/DROP TABLE public\.coach_knowledge_base;/);
    const order = [iCreate, iRevoke, iGrant, iDropFn, iGuard, iDropTable];
    expect(order).toEqual(order.slice().sort((a, b) => a - b));
  });
});
