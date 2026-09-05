// =============================================================================
// supabase/functions/chat-with-coach/rag/formatContext.ts
// =============================================================================
// Pure formatter of the RAG context block that chat-with-coach hands to the
// model: one entry per chunk retrieved from the live library
// (knowledge_documents + knowledge_chunks via match_knowledge_chunks), with
// its provenance — the document title — and the cosine similarity as a whole
// percentage. No I/O, no Deno API: covered by `deno test` next to it.
// =============================================================================

/** One row of `match_knowledge_chunks` (RETURNS TABLE, migration 20260430125629). */
export interface KnowledgeMatch {
  id: string;
  document_id: string;
  document_title: string;
  content: string;
  similarity: number;
}

/** Entries are separated by a blank line; the caller treats "" as "no context". */
export const CHUNK_SEPARATOR = "\n\n";

/**
 * Empty list → empty string. One entry →
 * `[Chunk 1 (Fonte: <document_title>) — Similarità: NN%]` + newline + content.
 * Numbering follows the list order (the RPC already sorts by distance).
 */
export function formatContext(matches: readonly KnowledgeMatch[]): string {
  return matches.map(formatChunk).join(CHUNK_SEPARATOR);
}

function formatChunk(m: KnowledgeMatch, index: number): string {
  const pct = (m.similarity * 100).toFixed(0);
  return `[Chunk ${index + 1} (Fonte: ${m.document_title}) — Similarità: ${pct}%]\n${m.content}`;
}
