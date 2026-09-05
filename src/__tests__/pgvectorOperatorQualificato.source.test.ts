// =============================================================================
// Cancello derivato (a) — fetta rag-una-libreria, 2026-09-05 (+ coda: i
// commenti SQL non sono codice).
// Ogni migrazione da questa fetta in poi che misura una distanza di pgvector
// la scrive QUALIFICATA sullo schema `extensions`: l'operatore come
// `OPERATOR(extensions.<=>)` (coseno; `<->` L2, `<#>` prodotto interno, `<+>`
// L1, `<~>` Hamming, `<%>` Jaccard) e la forma-funzione come
// `extensions.cosine_distance(…)` (l2_distance, inner_product, l1_distance).
// Perché: operatori e funzioni di pgvector vivono nello schema `extensions`, e
// 20260525120100_security_advisor_definer_hardening.sql pinna `search_path =
// public, pg_temp` su OGNI SECURITY DEFINER — una forma nuda dentro una
// funzione così muore in produzione con 42883 «operator/function does not
// exist» (misura di Cowork del 02/09: match_knowledge_chunks e match_documents
// rotte dal 25/05). Una sola grafia riconosciuta, minuscola e senza spazi: una
// grafia diversa ma valida (OPERATOR(EXTENSIONS.<=>), OPERATOR( extensions.<=> ))
// viene segnalata come nuda — falso positivo, il lato sicuro: si riscrive.
// Ogni controllo legge l'SQL SENZA commenti (`sqlWithoutComments`): un
// operatore nudo citato in un commento non è un operatore (misura di Cowork
// del 05/09: falso rosso), e uno statement commentato non è uno statement
// (stessa misura: quattro statement commentati, cancello verde — falso verde).
// Il cancello legge i SORGENTI (fs), come gli altri test «determinismo del
// modulo puro»: niente DB, niente runtime.
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

/** I sei operatori di distanza di pgvector NON preceduti da `OPERATOR(extensions.`. */
const NAKED_PGVECTOR_OPERATOR = /(?<!OPERATOR\(extensions\.)(<=>|<->|<#>|<\+>|<~>|<%>)/;
/** La forma-funzione delle stesse distanze, NON preceduta da `extensions.`. */
const NAKED_PGVECTOR_FUNCTION =
  /(?<!extensions\.)\b(cosine_distance|l2_distance|inner_product|l1_distance)\s*\(/;

export interface SqlScan {
  /** L'SQL con ogni carattere di commento sostituito da uno spazio (le newline restano). */
  code: string;
  /** Una stringa/identificatore o un commento a blocco aperti fino a fine file. */
  unclosed: null | "string" | "block";
}

/**
 * SQL grezzo → SQL senza commenti, a parità di righe e di posizioni, così i
 * `file:riga` del rosso e gli indici della struttura non cambiano.
 * Riconosce: `-- …` fino a fine riga (chiusa anche da un `\r` solo, come nello
 * scanner di Postgres) · i commenti a blocco anche annidati (Postgres li
 * annida) · stringhe `'…'` e identificatori `"…"` con `''`/`""` come carattere
 * ripetuto, copiati INTATTI — un `--` o un `/*` dentro una stringa non è un
 * commento, e un apostrofo in un identificatore non apre una stringa. Un corpo
 * dollar-quoted non è un'eccezione: dentro, `--` è un commento PL/pgSQL e `'…'`
 * una stringa, esattamente come fuori.
 * Fuori portata, dichiarato e inchiodato dal test «portata»: stringhe `E'…'`
 * (apice con backslash), dollar-quoting usato come STRINGA (non preceduto da
 * `AS`/`DO`) o con tag ANNIDATO in un corpo, e file con una stringa o un blocco
 * aperti fino alla fine — nessuno esiste nelle migrazioni sopra soglia.
 */
export function scanSql(sql: string): SqlScan {
  let out = "";
  let i = 0;
  const n = sql.length;
  let unclosed: SqlScan["unclosed"] = null;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "'" || c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) unclosed ??= "string";
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "-" && d === "-") {
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && d === "*") {
      let depth = 0;
      while (i < n) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          out += "  ";
          i += 2;
          continue;
        }
        if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          out += "  ";
          i += 2;
          if (depth === 0) break;
          continue;
        }
        out += sql[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (depth > 0) unclosed ??= "block";
      continue;
    }
    out += c;
    i++;
  }
  return { code: out, unclosed };
}

export const sqlWithoutComments = (sql: string): string => scanSql(sql).code;

const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length;

const allMigrations = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort();

const migrationsAtOrAfterThreshold = (): string[] =>
  allMigrations().filter((f) => f.slice(0, 14) >= OPERATOR_GATE_FROM_TIMESTAMP);

const readMigration = (file: string): string => readFileSync(MIGRATIONS_DIR + file, "utf8");

/** Le forme nude nel TESTO (già senza commenti), con etichetta e riga. */
export function nakedOccurrencesIn(sqlText: string, label: string): string[] {
  const hits: string[] = [];
  sqlWithoutComments(sqlText)
    .split(/\r?\n/)
    .forEach((line, i) => {
      const m = NAKED_PGVECTOR_OPERATOR.exec(line) ?? NAKED_PGVECTOR_FUNCTION.exec(line);
      if (m) hits.push(`${label}:${i + 1} — \`${m[1]}\` nudo: ${line.trim()}`);
    });
  return hits;
}

const nakedOccurrences = (file: string): string[] => nakedOccurrencesIn(readMigration(file), file);

describe("sqlWithoutComments — i commenti SQL non sono codice", () => {
  it("toglie `-- …` (chiusa da \\n o da \\r) e i commenti a blocco anche annidati, e conserva righe e posizioni", () => {
    const sql =
      "SELECT 1; -- via\n/* blocco\n   /* annidato */ ancora */ SELECT 2;\nSELECT 3; -- cr\rSELECT 4;";
    const out = sqlWithoutComments(sql);
    expect(out.split("\n")).toHaveLength(sql.split("\n").length);
    expect(out).toHaveLength(sql.length);
    expect(out).not.toContain("via");
    expect(out).not.toContain("annidato");
    expect(out).not.toContain("ancora");
    expect(out).not.toContain("cr");
    expect(out.replace(/\s+/g, " ").trim()).toBe("SELECT 1; SELECT 2; SELECT 3; SELECT 4;");
    expect(scanSql(sql).unclosed).toBeNull();
  });

  it("un `--` o un `/*` DENTRO una stringa o un identificatore non è un commento: restano intatti", () => {
    const sql =
      "RAISE EXCEPTION 'a -- b /* c'' d'; -- vero commento <=>\n" +
      "CREATE POLICY \"they''re in -- here\" ON t; -- via\n" +
      "SELECT '''';";
    const out = sqlWithoutComments(sql);
    expect(out).toContain("'a -- b /* c'' d'");
    expect(out).toContain("\"they''re in -- here\"");
    expect(out).toContain("SELECT ''''");
    expect(out).not.toContain("vero commento");
    expect(out).not.toContain("via");
    expect(out).not.toContain("<=>");
  });

  it("una stringa o un blocco aperti fino a fine file sono segnalati (Postgres rifiuterebbe il file)", () => {
    expect(scanSql("SELECT 'aperta").unclosed).toBe("string");
    expect(scanSql("SELECT 1; /* mai chiuso").unclosed).toBe("block");
    expect(scanSql("SELECT 'chiusa'; /* ok */").unclosed).toBeNull();
  });

  it("un `<=>` nudo dentro un commento NON è un operatore (il falso rosso del 05/09)", () => {
    const sql =
      "-- prima la riga diceva: ORDER BY kc.embedding <=> query_embedding\n" +
      "/* e anche: 1 - (a <-> b), cosine_distance(a, b), a <+> b */\n" +
      "SELECT 1 - (kc.embedding OPERATOR(extensions.<=>) q) FROM public.knowledge_chunks kc;";
    expect(nakedOccurrencesIn(sql, "fixture.sql")).toEqual([]);
  });

  it("lo stesso `<=>` nudo in uno statement È un operatore nudo, con file e riga — e così `<+>`", () => {
    const sql =
      "-- commento innocuo\n" +
      "SELECT 1 - (kc.embedding <=> q) FROM public.knowledge_chunks kc; -- <=> anche qui, ma è commento\n" +
      "ORDER BY kc.embedding <+> q;";
    expect(nakedOccurrencesIn(sql, "fixture.sql")).toEqual([
      "fixture.sql:2 — `<=>` nudo: SELECT 1 - (kc.embedding <=> q) FROM public.knowledge_chunks kc;",
      "fixture.sql:3 — `<+>` nudo: ORDER BY kc.embedding <+> q;",
    ]);
  });

  it("portata: sopra soglia nessuna stringa E'…' (né e'…'), nessun dollar-quoting fuori da AS/DO o con tag annidato, niente aperto a fine file — se compaiono, il tokenizer si estende, non si aggira", () => {
    const fuoriPortata = migrationsAtOrAfterThreshold().flatMap((f) => {
      const scan = scanSql(readMigration(f));
      const code = scan.code; // senza commenti: un «E'» in prosa italiana dentro un commento non è una stringa
      const hits: string[] = [];
      if (scan.unclosed === "string")
        hits.push(`${f}: stringa o identificatore aperti fino a fine file`);
      if (scan.unclosed === "block") hits.push(`${f}: commento a blocco aperto fino a fine file`);
      if (/\b[eE]'/.test(code)) hits.push(`${f}: stringa E'…'`);
      // Ogni regione dollar-quoted ($$ o $tag$) deve essere un CORPO (`AS $$`,
      // `DO $$`): lì `--` è un commento. Una stringa dollar-quoted usata come
      // DATO avrebbe i suoi `--` tolti per sbaglio: fuori portata, si segnala.
      const confini = new Set<number>();
      for (const m of code.matchAll(/(\$[A-Za-z_]*\$)[\s\S]*?\1/g)) {
        const before = code.slice(0, m.index).trimEnd();
        if (!/\b(AS|DO)$/i.test(before))
          hits.push(`${f}:${lineOf(code, m.index)}: dollar-quoting fuori da AS/DO`);
        confini.add(m.index);
        confini.add(m.index + m[0].length - m[1].length);
      }
      // Un tag dollar DENTRO una regione (es. RAISE NOTICE $m$ … $m$ nel corpo)
      // non è un confine: il tokenizer non lo conosce e un apostrofo lì dentro
      // lo desincronizzerebbe. Fuori portata, si segnala.
      for (const t of code.matchAll(/\$[A-Za-z_]+\$/g)) {
        if (!confini.has(t.index))
          hits.push(`${f}:${lineOf(code, t.index)}: dollar-quoting con tag annidato (${t[0]})`);
      }
      return hits;
    });
    expect(fuoriPortata).toEqual([]);
    // E su ogni migrazione sopra soglia il tokenizer conserva righe e lunghezza.
    for (const f of migrationsAtOrAfterThreshold()) {
      const sql = readMigration(f);
      const out = sqlWithoutComments(sql);
      expect(out.split("\n").length, `${f}: righe cambiate`).toBe(sql.split("\n").length);
      expect(out.length, `${f}: lunghezza cambiata`).toBe(sql.length);
    }
  });
});

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

  it("nessuna migrazione con timestamp ≥ soglia contiene un operatore di distanza nudo (<=>, <->, <#>, <+>, <~>, <%>) né cosine_distance(…) e sorelle non qualificate — commenti esclusi (file e riga)", () => {
    const offenders = migrationsAtOrAfterThreshold().flatMap(nakedOccurrences);
    expect(
      offenders,
      "distanza pgvector NUDA in una migrazione sopra soglia — dentro una SECURITY DEFINER con " +
        "search_path = public, pg_temp muore con 42883. Scrivila ESATTAMENTE `OPERATOR(extensions.<=>)` " +
        "(minuscolo, senza spazi: l'unica grafia che il cancello riconosce) o `extensions.cosine_distance(…)`:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("la migrazione di questa fetta: i sei statement operativi presenti e in ordine, 3 operatori qualificati tutti nel corpo, search_path pinnato, anon mai ri-concesso — letti SENZA commenti", () => {
    const sql = sqlWithoutComments(readMigration(RAG_UNA_LIBRERIA_MIGRATION));

    // Gli statement si cercano nel testo SENZA commenti: `-- DROP TABLE …` non
    // è un DROP (misura del 05/09: quattro statement commentati, cancello verde).
    const STATEMENTS: Array<[string, RegExp]> = [
      [
        "CREATE OR REPLACE FUNCTION match_knowledge_chunks",
        /CREATE OR REPLACE FUNCTION public\.match_knowledge_chunks\(/,
      ],
      [
        "REVOKE EXECUTE … FROM PUBLIC, anon",
        /REVOKE EXECUTE ON FUNCTION public\.match_knowledge_chunks\(extensions\.vector, double precision, integer\) FROM PUBLIC, anon;/,
      ],
      [
        "GRANT EXECUTE … TO authenticated, service_role",
        /GRANT EXECUTE ON FUNCTION public\.match_knowledge_chunks\(extensions\.vector, double precision, integer\) TO authenticated, service_role;/,
      ],
      [
        "DROP FUNCTION match_documents",
        /DROP FUNCTION public\.match_documents\(extensions\.vector, uuid, double precision, integer\);/,
      ],
      [
        "cancello «tabella ancora vuota» (IF EXISTS … RAISE EXCEPTION)",
        /IF EXISTS \(SELECT 1 FROM public\.coach_knowledge_base\) THEN\s+RAISE EXCEPTION/,
      ],
      ["DROP TABLE coach_knowledge_base", /DROP TABLE public\.coach_knowledge_base;/],
    ];
    const positions = STATEMENTS.map(([name, re]) => ({ name, at: sql.search(re) }));
    const missing = positions.filter((p) => p.at < 0).map((p) => p.name);
    expect(
      missing,
      "statement operativi ASSENTI dalla migrazione (commentati o cancellati):\n" +
        missing.join("\n"),
    ).toEqual([]);
    const order = positions.map((p) => p.at);
    expect(order, "i passi (a) funzione → (b) ACL → (c) DROP non sono in quest'ordine").toEqual(
      order.slice().sort((a, b) => a - b),
    );

    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    // Lo stato finale dell'ACL, non solo la presenza del REVOKE: nessun GRANT
    // sulla funzione nomina anon (un GRANT in coda riaprirebbe la porta).
    expect(sql, "anon non deve riavere EXECUTE sulla funzione").not.toMatch(
      /GRANT[^;]*match_knowledge_chunks[^;]*\banon\b/,
    );

    // Per costruzione: senza commenti, le occorrenze qualificate dell'intero
    // file sono ESATTAMENTE le tre del corpo (SELECT, WHERE, ORDER BY) —
    // il commento di testa, che nomina la forma qualificata, non esiste più.
    const bodyStart = sql.indexOf("AS $$");
    const bodyEnd = sql.indexOf("$$;", bodyStart);
    expect(bodyStart, "corpo di match_knowledge_chunks (AS $$ … $$;) non trovato").toBeGreaterThan(
      -1,
    );
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const qualifiedAt: number[] = [];
    for (const m of sql.matchAll(/OPERATOR\(extensions\.<=>\)/g)) qualifiedAt.push(m.index);
    expect(
      qualifiedAt,
      "il coseno qualificato compare tre volte nel file senza commenti: SELECT, WHERE, ORDER BY",
    ).toHaveLength(3);
    for (const at of qualifiedAt) {
      expect(at, "operatore qualificato fuori dal corpo della funzione").toBeGreaterThan(bodyStart);
      expect(at, "operatore qualificato fuori dal corpo della funzione").toBeLessThan(bodyEnd);
    }
    expect(
      nakedOccurrencesIn(readMigration(RAG_UNA_LIBRERIA_MIGRATION), RAG_UNA_LIBRERIA_MIGRATION),
    ).toEqual([]);
  });
});
