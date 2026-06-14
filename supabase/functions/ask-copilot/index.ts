// =============================================================================
// supabase/functions/ask-copilot/index.ts
// =============================================================================
// PHASE 5.3 — Master Copilot RAG Engine (retrieval + generation)
//
// Pipeline:
//   1. Authenticate the caller (user-scoped Supabase client → RLS + auth.uid()
//      power the match_knowledge_chunks RPC's coach resolution).
//   2. Embed the incoming `message` via OpenAI text-embedding-3-small
//      (1536 dims) via OpenAI's embeddings endpoint.
//   3. Call the `match_knowledge_chunks` RPC with cosine threshold 0.75 and
//      LIMIT 5. The RPC internally resolves coach_id from auth.uid() (coach
//      sees own chunks; athlete sees their coach's chunks), so we never trust
//      a client-supplied coach_id.
//   4. Concatenate retrieved chunk contents (with provenance) into a single
//      context block.
//   5. Build a strict system prompt that *forbids* answering outside of the
//      retrieved context, prepend it to the chat history + the new user
//      message, and call OpenAI chat completions (model: gpt-5.4-mini).
//   6. Return { answer, sources } JSON.
//
// All outbound network calls are wrapped in AbortController timeouts so a
// hung upstream cannot pin an edge function instance for 60+ seconds.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// -----------------------------------------------------------------------------
// CORS — mirrors every other function in this project. Includes the
// x-supabase-client-* headers that supabase-js v2 adds automatically; without
// them the browser preflight fails.
// -----------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// -----------------------------------------------------------------------------
// Tunables
// -----------------------------------------------------------------------------
const MATCH_THRESHOLD = 0.75;
const MATCH_COUNT = 5;
const EMBEDDING_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 45_000;
const EMBEDDING_RETRIES = 3;
const MAX_HISTORY_TURNS = 20; // hard cap to keep the prompt bounded
const MAX_MESSAGE_LEN = 4_000; // characters; defends against pathological input

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface MatchedChunk {
  id: string;
  document_id: string;
  document_title: string;
  content: string;
  similarity: number;
}

// =============================================================================
// fetchWithTimeout — wraps fetch with an AbortController so a stalled upstream
// (OpenAI) cannot hold the function open indefinitely.
// =============================================================================
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================================
// getEmbedding — OpenAI text-embedding-3-small (1536 dims, matches schema).
// Exponential backoff on 429. Mirrors the pattern in ingest-knowledge so the
// query-side and ingest-side embeddings are guaranteed consistent.
// =============================================================================
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  for (let attempt = 0; attempt < EMBEDDING_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text,
          }),
        },
        EMBEDDING_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Timeout durante l'embedding della richiesta.");
      }
      throw err;
    }

    if (response.status === 429 && attempt < EMBEDDING_RETRIES - 1) {
      const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.warn(
        `[ask-copilot] Embedding rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${EMBEDDING_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ask-copilot] OpenAI embedding error:", response.status, errorText);
      if (response.status === 429) {
        throw new Error("Limite di richieste raggiunto. Riprova tra qualche minuto.");
      }
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) {
      throw new Error("Embedding API returned no vector");
    }
    return vec;
  }
  throw new Error("Embedding failed after retries");
}

// =============================================================================
// HTTP HANDLER
// =============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // -------------------------------------------------------------------------
    // 0. AUTH — required. The user JWT is forwarded into the Supabase client
    //    so the RPC's `auth.uid()` resolves and RLS applies.
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 0b. ENV — fail fast and explicit. Do NOT degrade silently: the whole
    //     point of this function is RAG, so missing keys = hard error.
    // -------------------------------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[ask-copilot] Missing Supabase env vars");
      return new Response(JSON.stringify({ error: "Configurazione server mancante" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!openaiKey) {
      console.error("[ask-copilot] OPENAI_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "Servizio AI non configurato" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 0c. VALIDATE JWT — Security Advisor critical fix.
    //     We must call auth.getUser() BEFORE the mode branches below.
    //     Previously the structured modes (meal_suggestion / session_adaptation)
    //     returned an AI response without ever validating the bearer token,
    //     so any string in the Authorization header would unlock free AI
    //     usage. The `if (!authHeader)` check above only verifies presence,
    //     not validity. This block forces token verification first.
    // -------------------------------------------------------------------------
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 1. PARSE & VALIDATE INPUT
    // -------------------------------------------------------------------------
    let body: {
      message?: unknown;
      history?: unknown;
      mode?: unknown;
      remainingMacros?: unknown;
      readiness?: unknown;
      todayWorkout?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON non valido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 1b. STRUCTURED MODES — meal_suggestion / session_adaptation bypass RAG
    //     and return strict JSON. OpenAI chat completions, no embeddings needed.
    // -------------------------------------------------------------------------
    const mode = typeof body.mode === "string" ? body.mode : null;
    if (mode === "meal_suggestion" || mode === "session_adaptation") {
      const sysPrompt =
        mode === "meal_suggestion"
          ? `You are an elite sports nutritionist. Given the athlete's REMAINING macros for today, propose ONE single meal that fits as closely as possible.
Return STRICT JSON with this exact shape (no markdown, no prose):
{"name": string, "prepMinutes": number, "imageUrl": string, "protein": number, "fats": number, "carbs": number, "calories": number}
- Use realistic Italian meal names.
- imageUrl can be empty string if unknown.
- All nutrient numbers in grams; calories in kcal as integers.`
          : `You are an elite Clinical Sports Coach. Given the athlete's READINESS data and today's WORKOUT structure, produce a safer, adapted plan.
Return STRICT JSON with this exact shape (no markdown):
{
  "rationale": string,
  "adaptations": [{"type": "swap"|"reduce"|"add", "from": string|null, "to": string, "detail": string}],
  "safePlan": [{"name": string, "sets": number, "reps": string, "load": string, "notes": string}]
}
Keep adaptations <= 5. safePlan should be the new full workout structure.`;

      const userPayload =
        mode === "meal_suggestion"
          ? { remainingMacros: body.remainingMacros ?? null }
          : { readiness: body.readiness ?? null, todayWorkout: body.todayWorkout ?? null };

      let aiResp: Response;
      try {
        aiResp = await fetchWithTimeout(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-5.4-mini",
              messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: JSON.stringify(userPayload) },
              ],
              response_format: { type: "json_object" },
              stream: false,
            }),
          },
          CHAT_TIMEOUT_MS,
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return new Response(JSON.stringify({ error: "Timeout AI" }), {
            status: 504,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw err;
      }

      if (!aiResp.ok) {
        if (aiResp.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          return new Response(JSON.stringify({ error: "Crediti AI esauriti" }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResp.text();
        console.error("[ask-copilot] mode AI error", aiResp.status, t);
        return new Response(JSON.stringify({ error: "Errore gateway AI" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiJson = await aiResp.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "";
      let parsed: unknown = null;
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        const m = typeof raw === "string" ? raw.match(/\{[\s\S]*\}/) : null;
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch {
            parsed = null;
          }
        }
      }
      if (!parsed) {
        return new Response(JSON.stringify({ error: "Risposta AI non valida" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawMessage = body.message;
    if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Messaggio richiesto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const message = rawMessage.trim().slice(0, MAX_MESSAGE_LEN);

    // History is optional; sanitize aggressively so we can't be coerced into
    // forwarding arbitrary system messages from a malicious client.
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const history: ChatMessage[] = rawHistory
      .filter((m): m is { role: unknown; content: unknown } => m !== null && typeof m === "object")
      .map((m) => ({ role: m.role, content: m.content }))
      .filter(
        (m): m is ChatMessage =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length > 0,
      )
      .slice(-MAX_HISTORY_TURNS);

    // -------------------------------------------------------------------------
    // 2. SUPABASE CLIENT — already created and JWT-validated in step 0c above.
    //    RLS + auth.uid() inside match_knowledge_chunks decide which coach's
    //    corpus to retrieve from.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // 3. EMBED THE QUERY
    // -------------------------------------------------------------------------
    const queryEmbedding = await getEmbedding(message, openaiKey);

    // -------------------------------------------------------------------------
    // 4. RETRIEVE — match_knowledge_chunks resolves coach_id internally from
    //    auth.uid() (coach role → own corpus; athlete role → coach's corpus).
    //    We pass the embedding as a JSON-stringified array because PostgREST's
    //    pgvector binding accepts that form. (Same convention as ingest-knowledge.)
    // -------------------------------------------------------------------------
    const { data: matches, error: matchError } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(queryEmbedding) as unknown as string,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    });

    if (matchError) {
      console.error("[ask-copilot] match_knowledge_chunks error:", matchError);
      return new Response(JSON.stringify({ error: "Errore durante il recupero del contesto" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks: MatchedChunk[] = (matches as MatchedChunk[] | null) ?? [];

    // -------------------------------------------------------------------------
    // 5. BUILD CONTEXT — provenance is included so the model can attribute
    //    answers and the client can render source citations.
    // -------------------------------------------------------------------------
    const contextBlock = chunks
      .map(
        (c, i) =>
          `[Source ${i + 1} — "${c.document_title}" — similarity ${(c.similarity * 100).toFixed(1)}%]\n${c.content}`,
      )
      .join("\n\n---\n\n");

    // The system prompt is intentionally strict. The model is not allowed to
    // fall back on world knowledge; if the answer isn't in the manuals, it
    // must say so. Without this instruction RAG quietly devolves into a
    // generic chatbot that hallucinates plausibly.
    const systemPrompt =
      chunks.length > 0
        ? `You are an elite Clinical Sports Copilot. You must answer questions using ONLY the provided context from the coach's proprietary manuals. If the answer is not in the context, say you don't know based on the manuals. Cite the relevant Source numbers inline (e.g. "[Source 2]") when you draw on them. Do not invent facts, do not use external knowledge, and do not speculate.

Context:

${contextBlock}`
        : `You are an elite Clinical Sports Copilot. You must answer questions using ONLY the provided context from the coach's proprietary manuals. No relevant context was retrieved for this question. Reply that you don't know based on the manuals and suggest the user rephrase or ask the coach directly. Do not use external knowledge.`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history,
      { role: "user" as const, content: message },
    ];

    // -------------------------------------------------------------------------
    // 6. LLM — OpenAI chat completions.
    //    Non-streaming: the hook awaits a complete answer, which keeps the
    //    client contract trivial. Switch to SSE later if the UX needs it.
    // -------------------------------------------------------------------------
    let aiResponse: Response;
    try {
      aiResponse = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-5.4-mini",
            messages,
            stream: false,
          }),
        },
        CHAT_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("[ask-copilot] Chat completion timed out");
        return new Response(
          JSON.stringify({ error: "Timeout: il modello AI non ha risposto in tempo." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

    if (!aiResponse.ok) {
      // Map upstream rate-limit / quota errors to the same surfaces other
      // functions in this codebase use, so the UI can show a consistent toast.
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite richieste AI raggiunto. Riprova tra qualche minuto." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crediti AI esauriti. Contatta il supporto." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errText = await aiResponse.text();
      console.error("[ask-copilot] OpenAI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Errore gateway AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const answer: string = aiData?.choices?.[0]?.message?.content ?? "";

    if (!answer) {
      console.error("[ask-copilot] AI returned empty answer", aiData);
      return new Response(
        JSON.stringify({ error: "Il modello AI ha restituito una risposta vuota." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------------------
    // 7. RESPOND — also expose the sources so the UI can render citation chips.
    // -------------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        answer,
        sources: chunks.map((c) => ({
          chunk_id: c.id,
          document_id: c.document_id,
          document_title: c.document_title,
          similarity: c.similarity,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ask-copilot] Unhandled error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Errore sconosciuto",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
