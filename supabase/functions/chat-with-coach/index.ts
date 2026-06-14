import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      const waitMs = Math.pow(2, attempt + 1) * 1000;
      console.warn(`Rate limited, retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Embedding error:", response.status, errorText);
      if (response.status === 429) {
        throw new Error("Limite di richieste raggiunto. Riprova tra qualche minuto.");
      }
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
  throw new Error("Embedding failed after retries");
}

// Check if two dates are the same calendar day (UTC)
function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");

    // User-scoped client — used for reads that benefit from RLS and for
    // verifying the caller identity via auth.getUser().
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service-role client — used ONLY for writes on ai_usage_tracking
    // (quota state). RLS policies on this table forbid user-side writes
    // since 20260525120000 (Security Advisor #7: AI rate limit bypass).
    // Reads still go through the user client so RLS scoping is honored.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user and get their coach
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

    // Get the user's profile to find their coach_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, coach_id")
      .eq("id", user.id)
      .single();

    // Determine which coach's knowledge base to query
    const coachId = profile?.role === "coach" ? user.id : profile?.coach_id;

    if (!coachId) {
      return new Response(
        JSON.stringify({ error: "Nessun coach associato. Contatta il tuo coach." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { query, history } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Query mancante" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Quota check (lazy reset) ──
    const now = new Date();
    let { data: usage } = await supabase
      .from("ai_usage_tracking")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!usage) {
      // First ever message – create row (service role: RLS forbids user INSERT)
      const { data: newRow } = await supabaseAdmin
        .from("ai_usage_tracking")
        .insert({ user_id: user.id, message_count: 0, last_reset_at: now.toISOString() })
        .select()
        .single();
      usage = newRow;
    }

    if (usage) {
      const lastReset = new Date(usage.last_reset_at);

      // Lazy reset if different day (service role: RLS forbids user UPDATE)
      if (!isSameDay(lastReset, now)) {
        await supabaseAdmin
          .from("ai_usage_tracking")
          .update({ message_count: 0, last_reset_at: now.toISOString() })
          .eq("user_id", user.id);
        usage.message_count = 0;
      }

      // Check limit
      if (usage.message_count >= usage.daily_limit) {
        return new Response(
          JSON.stringify({ error: "Hai raggiunto il limite giornaliero di messaggi AI." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 1. Try to embed the query and retrieve RAG context
    let contextChunks = "";
    if (openaiKey) {
      try {
        const queryEmbedding = await getEmbedding(query, openaiKey);

        const { data: matches, error: matchError } = await supabase.rpc("match_documents", {
          query_embedding: JSON.stringify(queryEmbedding),
          p_coach_id: coachId,
          match_threshold: 0.5,
          match_count: 3,
        });

        if (matchError) {
          console.error("match_documents error:", matchError);
        }

        contextChunks = (matches || [])
          .map(
            (
              m: { content: string; similarity: number; metadata: Record<string, unknown> },
              i: number,
            ) => {
              const source = m.metadata?.source ? ` (Fonte: ${m.metadata.source})` : "";
              return `[Chunk ${i + 1}${source} — Similarità: ${(m.similarity * 100).toFixed(0)}%]\n${m.content}`;
            },
          )
          .join("\n\n");
      } catch (embeddingError) {
        console.warn("Embedding/RAG failed, proceeding without context:", embeddingError);
      }
    } else {
      console.warn("OPENAI_API_KEY not set, skipping RAG embedding");
    }

    const hasContext = contextChunks.length > 0;

    const systemPrompt = hasContext
      ? `Sei un Assistente AI che rispecchia la filosofia specifica del Coach. Rispondi ESCLUSIVAMENTE usando il seguente Contesto. Se la risposta non è nel contesto, rispondi: "Non ho informazioni specifiche su questo argomento nella knowledge base del Coach. Ti consiglio di chiedere direttamente al tuo Coach."

CONTESTO:
${contextChunks}

REGOLE:
- Rispondi sempre in italiano
- Cita le fonti quando disponibili
- Sii conciso ma completo
- Non inventare informazioni non presenti nel contesto`
      : `Sei un Assistente AI di un Coach sportivo. Al momento non hai accesso a documenti specifici del Coach nella knowledge base. Rispondi: "Non ho ancora informazioni nella knowledge base del Coach. Chiedi al tuo Coach di caricare i materiali formativi per ricevere risposte personalizzate."`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: query },
    ];

    // Call OpenAI Chat Completions with streaming
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Troppe richieste, riprova tra poco." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Crediti AI esauriti." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("OpenAI error:", aiResponse.status, errorText);
      throw new Error("Errore nel servizio AI");
    }

    // ── Increment usage after successful AI call ──
    // Service role: RLS forbids user-side UPDATE on ai_usage_tracking
    // (Security Advisor #7).
    if (usage) {
      await supabaseAdmin
        .from("ai_usage_tracking")
        .update({ message_count: usage.message_count + 1 })
        .eq("user_id", user.id);
    }

    // Stream the response back
    return new Response(aiResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("chat-with-coach error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
