// supabase/functions/chat-with-coach/rag/formatContext.test.ts
// Pins for the RAG context block: the empty library is an empty string, a
// single chunk carries its provenance (document title) and a whole-percent
// similarity, several chunks are numbered in list order and separated by a
// blank line. Nothing here touches the network or Deno APIs.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { CHUNK_SEPARATOR, formatContext, type KnowledgeMatch } from "./formatContext.ts";

function chunk(over: Partial<KnowledgeMatch> = {}): KnowledgeMatch {
  return {
    id: "c1",
    document_id: "d1",
    document_title: "Manuale RPE",
    content: "RPE 8 significa due ripetizioni in riserva.",
    similarity: 0.87,
    ...over,
  };
}

Deno.test("lista vuota → stringa vuota (nessun contesto, non un contesto vuoto)", () => {
  assertEquals(formatContext([]), "");
});

Deno.test("una voce → [Chunk 1 (Fonte: <document_title>) — Similarità: NN%] + contenuto", () => {
  assertEquals(
    formatContext([chunk()]),
    "[Chunk 1 (Fonte: Manuale RPE) — Similarità: 87%]\nRPE 8 significa due ripetizioni in riserva.",
  );
});

Deno.test("la fonte citata è document_title, ogni voce la porta", () => {
  const out = formatContext([
    chunk({ document_title: "Manuale RPE" }),
    chunk({ id: "c2", document_id: "d2", document_title: "Guida al deload", similarity: 0.5 }),
  ]);
  assertStringIncludes(out, "(Fonte: Manuale RPE)");
  assertStringIncludes(out, "(Fonte: Guida al deload)");
});

Deno.test("più voci: numerate nell'ordine della lista, separate da una riga vuota", () => {
  const out = formatContext([
    chunk({ content: "primo" }),
    chunk({ id: "c2", content: "secondo", similarity: 0.5 }),
  ]);
  assertEquals(
    out,
    "[Chunk 1 (Fonte: Manuale RPE) — Similarità: 87%]\nprimo" +
      CHUNK_SEPARATOR +
      "[Chunk 2 (Fonte: Manuale RPE) — Similarità: 50%]\nsecondo",
  );
});

Deno.test("la similarità è una percentuale intera (0.5 → 50%, 1 → 100%, 0.004 → 0%)", () => {
  assertStringIncludes(formatContext([chunk({ similarity: 0.5 })]), "Similarità: 50%]");
  assertStringIncludes(formatContext([chunk({ similarity: 1 })]), "Similarità: 100%]");
  assertStringIncludes(formatContext([chunk({ similarity: 0.004 })]), "Similarità: 0%]");
});

Deno.test("il contenuto è riportato integro, a capo compresi", () => {
  const out = formatContext([chunk({ content: "riga 1\nriga 2" })]);
  assertEquals(out, "[Chunk 1 (Fonte: Manuale RPE) — Similarità: 87%]\nriga 1\nriga 2");
});
