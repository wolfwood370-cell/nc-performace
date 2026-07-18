// supabase/functions/ingest-knowledge/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// =============================================================================
// CHUNKING — Recursive Character Text Splitter
// =============================================================================
// LangChain-style recursive splitter. We try increasingly granular separators:
// paragraph → line → sentence → word → raw character. This keeps semantic units
// (whole paragraphs, then sentences) together whenever they fit inside the
// chunk budget, only falling back to harder cuts when a single block is too
// big. Each chunk gets an `overlap`-sized prefix carried over from the previous
// one so context isn't lost across chunk boundaries — critical for retrieval
// quality, since the answer to a query may straddle a split point.
// =============================================================================
const SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

function recursiveSplit(text: string, chunkSize: number, separators: string[]): string[] {
  // Base case — text already fits.
  if (text.length <= chunkSize) return [text];

  // Pick the coarsest separator that actually appears in this text; fall back
  // to the finest (empty string = character-level split) if none match.
  const separator = separators.find((s) => s !== "" && text.includes(s)) ?? "";
  const remainingSeparators = separators.slice(separators.indexOf(separator) + 1);

  // Character-level fallback: hard slice into chunkSize windows.
  const splits =
    separator === ""
      ? (text.match(new RegExp(`.{1,${chunkSize}}`, "gs")) ?? [])
      : text.split(separator);

  const chunks: string[] = [];
  let buffer = "";

  for (const piece of splits) {
    const candidate = buffer ? buffer + separator + piece : piece;

    if (candidate.length <= chunkSize) {
      // Still fits — keep accumulating into the current buffer.
      buffer = candidate;
    } else {
      // Flushing point. If the buffer alone is already valid, emit it and
      // start a fresh buffer with the new piece.
      if (buffer) chunks.push(buffer);

      if (piece.length > chunkSize) {
        // The single piece itself is oversized → recurse with a finer separator.
        chunks.push(...recursiveSplit(piece, chunkSize, remainingSeparators));
        buffer = "";
      } else {
        buffer = piece;
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  // Normalize whitespace so the splitter sees clean paragraph boundaries.
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const rawChunks = recursiveSplit(normalized, chunkSize, SEPARATORS);

  // Add overlap: prepend the tail of chunk N-1 to chunk N. This carries
  // ~200 chars of context across boundaries so that a sentence cut in half
  // can still be retrieved when its key terms live just before the cut.
  const withOverlap: string[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const current = rawChunks[i].trim();
    if (i === 0) {
      withOverlap.push(current);
    } else {
      const prev = rawChunks[i - 1];
      const tail = prev.slice(Math.max(0, prev.length - overlap));
      withOverlap.push((tail + " " + current).trim());
    }
  }

  // Drop fragments too small to carry meaningful signal.
  return withOverlap.filter((c) => c.length > 20);
}

// =============================================================================
// EMBEDDING — OpenAI text-embedding-3-small (1536 dims)
// =============================================================================
// Exponential backoff on 429 (rate limit). We keep this on direct OpenAI
// rather than the Lovable AI Gateway — the gateway is chat-completions only.
// =============================================================================
async function getEmbedding(text: string, apiKey: string, retries = 3): Promise<number[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (response.status === 429 && attempt < retries - 1) {
      const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.warn(
        `Rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI embedding error:", response.status, errorText);
      if (response.status === 429) {
        throw new Error("Limite di richieste OpenAI raggiunto. Riprova tra qualche minuto.");
      }
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
  throw new Error("Embedding failed after retries");
}

// =============================================================================
// HTTP HANDLER
// =============================================================================
// Contract: POST { documentId: string, textContent: string }
// Pipeline: validate → mark processing → split → embed (sequential, batched
// inserts) → mark processed (or failed). Status transitions are persisted so
// the UI can poll/subscribe and show progress.
// =============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // We pull this out early so the catch block can flip status → 'failed'.
  let documentId: string | undefined;
  let adminClient: ReturnType<typeof createClient> | undefined;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // User-scoped client: respects RLS, used to verify caller identity & ownership.
    const userClient = createClient(supabaseUrl, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client: used for writes after we've authorized the caller. Bypasses
    // RLS for fast batch inserts, but every write is still constrained by the
    // coach_id we resolved from the user session — never from request input.
    adminClient = createClient(supabaseUrl, secretKey(), {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    documentId = body.documentId;
    const textContent: string | undefined = body.textContent;

    if (!documentId || !textContent || textContent.trim().length === 0) {
      return new Response(JSON.stringify({ error: "documentId e textContent sono richiesti" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership check — the caller must own the parent document. We use the
    // user-scoped client so RLS enforces this for free.
    const { data: doc, error: docError } = await userClient
      .from("knowledge_documents")
      .select("id, coach_id, status")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Documento non trovato" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Flip to 'processing' so the UI can show a spinner / disable re-trigger.
    await adminClient
      .from("knowledge_documents")
      .update({ status: "processing", error_message: null })
      .eq("id", documentId);

    // -------------------------------------------------------------------------
    // SPLIT
    // -------------------------------------------------------------------------
    const chunks = chunkText(textContent, 1000, 200);
    if (chunks.length === 0) {
      throw new Error("Il documento non contiene testo sufficiente da indicizzare");
    }

    // -------------------------------------------------------------------------
    // EMBED + INSERT (sequential embedding to respect OpenAI rate limits,
    // batched DB inserts of 50 rows to minimize round-trips)
    // -------------------------------------------------------------------------
    const DB_BATCH_SIZE = 50;
    const EMBED_DELAY_MS = 250; // gentle pacing between embedding calls
    let insertedCount = 0;
    let pendingRows: Array<{
      document_id: string;
      coach_id: string;
      chunk_index: number;
      content: string;
      embedding: string;
    }> = [];

    const flush = async () => {
      if (pendingRows.length === 0) return;
      const { error: insertError } = await adminClient!
        .from("knowledge_chunks")
        .insert(pendingRows);
      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
      insertedCount += pendingRows.length;
      pendingRows = [];
    };

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk, openaiKey);

      pendingRows.push({
        document_id: documentId,
        coach_id: user.id,
        chunk_index: i,
        content: chunk,
        // pgvector accepts the JSON-array string form via PostgREST.
        embedding: JSON.stringify(embedding),
      });

      if (pendingRows.length >= DB_BATCH_SIZE) {
        await flush();
      }
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, EMBED_DELAY_MS));
      }
    }
    await flush();

    // -------------------------------------------------------------------------
    // FINALIZE — mark document as ready for retrieval
    // -------------------------------------------------------------------------
    await adminClient
      .from("knowledge_documents")
      .update({
        status: "processed",
        chunk_count: insertedCount,
        error_message: null,
      })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        chunks_created: insertedCount,
        message: `${insertedCount} chunk(s) indicizzati con successo.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ingest-knowledge error:", e);

    // Best-effort: persist the failure so the UI can surface it and offer retry.
    if (documentId && adminClient) {
      try {
        await adminClient
          .from("knowledge_documents")
          .update({
            status: "failed",
            error_message: e instanceof Error ? e.message : String(e),
          })
          .eq("id", documentId);
      } catch (updateErr) {
        console.error("Failed to mark document as failed:", updateErr);
      }
    }

    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Errore durante l'indicizzazione",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
