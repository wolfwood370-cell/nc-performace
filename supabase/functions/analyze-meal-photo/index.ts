// supabase/functions/analyze-meal-photo/index.ts

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { romeDayFromDate } from "../_shared/nutrition/romeDate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hard cap on inbound payload. The vision model can technically handle large
// images, but a 10MB base64 blob already covers a 7.5MB raw photo (more than
// enough for meal photography) and forecloses naive DoS via gigabyte uploads.
const MAX_IMAGE_BASE64_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `You are an elite sports nutritionist and registered dietitian with 20+ years of experience analyzing meals for professional athletes. Your specialty is rapid, precise macronutrient estimation from visual inspection.

When analyzing a meal photo, you must:
1. Identify all visible food items and ingredients with precision
2. Estimate portion sizes using visual cues (plate size ~26cm standard, utensil scale, hand-relative dimensions)
3. Calculate total macronutrients accounting for cooking methods (oils, butters, sauces add hidden calories)
4. Provide a confidence score (1-100) based on:
   - Image clarity and angle (penalize obscured/partial views)
   - Ambiguity of preparation method
   - Hidden ingredients (sauces, oils, fillings)
   - Portion size certainty
5. Be conservative with estimates — athletes rely on accuracy. When uncertain, lean toward realistic averages rather than optimistic numbers.

CRITICAL OUTPUT RULES:
- Respond ONLY with a single valid JSON object. No markdown, no code fences, no commentary.
- All numeric fields must be numbers (not strings), rounded to whole integers.
- "mealName" should be concise and descriptive (e.g., "Grilled Chicken Caesar Salad", not "A salad").
- "ingredients" must be an array of identifiable component strings.
- "confidenceScore" must reflect genuine certainty — do not default to high values.

Required JSON schema:
{
  "mealName": string,
  "calories": number,
  "protein": number,
  "carbs": number,
  "fats": number,
  "confidenceScore": number,
  "ingredients": string[]
}`;

interface AnalyzeRequest {
  imageBase64: string;
  mimeType?: string;
}

interface MealAnalysis {
  mealName: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  confidenceScore: number;
  ingredients: string[];
}

function validateAnalysis(data: unknown): MealAnalysis {
  if (!data || typeof data !== "object") {
    throw new Error("AI response is not a valid object");
  }

  const d = data as Record<string, unknown>;

  const mealName = typeof d.mealName === "string" ? d.mealName.trim() : "";
  const calories = Number(d.calories);
  const protein = Number(d.protein);
  const carbs = Number(d.carbs);
  const fats = Number(d.fats);
  const confidenceScore = Number(d.confidenceScore);
  const ingredients = Array.isArray(d.ingredients)
    ? d.ingredients.filter((i): i is string => typeof i === "string")
    : [];

  if (!mealName) throw new Error("Missing or invalid mealName");
  if (!Number.isFinite(calories) || calories < 0) {
    throw new Error("Invalid calories value");
  }
  if (!Number.isFinite(protein) || protein < 0) {
    throw new Error("Invalid protein value");
  }
  if (!Number.isFinite(carbs) || carbs < 0) {
    throw new Error("Invalid carbs value");
  }
  if (!Number.isFinite(fats) || fats < 0) {
    throw new Error("Invalid fats value");
  }
  if (!Number.isFinite(confidenceScore) || confidenceScore < 1 || confidenceScore > 100) {
    throw new Error("Invalid confidenceScore (must be 1-100)");
  }

  return {
    mealName,
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fats: Math.round(fats),
    confidenceScore: Math.round(confidenceScore),
    ingredients,
  };
}

function extractJson(raw: string): string {
  // Strip markdown fences if the model ignored instructions
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Fallback: extract first {...} block
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // -------------------------------------------------------------------------
    // SECURITY GATE — even with verify_jwt = true at the gateway (see
    // supabase/config.toml), we re-verify here so the function is safe to
    // run even if the gateway flag is ever toggled off, and so we have the
    // user.id available for logging / future per-user rate limiting.
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("[analyze-meal-photo] Missing Supabase env vars");
      return new Response(JSON.stringify({ error: "Configurazione server mancante" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await supabaseUser.auth.getUser();
    const user = userData?.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sessione non valida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: log who called for audit / cost attribution. (Cheap; one
    // log line per AI invocation is well within Supabase log quota.)
    console.log("[analyze-meal-photo] invocation", { userId: user.id });

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      console.error("[analyze-meal-photo] OPENAI_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: AnalyzeRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, mimeType = "image/jpeg" } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
      return new Response(JSON.stringify({ error: "Image too large (max 10MB base64)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize: accept both raw base64 and full data URLs
    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType};base64,${imageBase64}`;

    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this meal. Return ONLY the JSON object matching the required schema.",
            },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    });

    const rawContent = completion.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") {
      throw new Error("AI returned empty response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(rawContent));
    } catch (parseErr) {
      console.error("[analyze-meal-photo] JSON parse failed:", rawContent);
      throw new Error("AI response was not valid JSON");
    }

    const analysis = validateAnalysis(parsed);

    // Best-effort persistence into nutrition_logs UNDER THE ATHLETE'S JWT
    // (supabaseUser + RLS insert-own — no service role: least privilege).
    // The analysis is the product and the AI cost is already spent: an insert
    // failure never turns the response into an error, it only flips
    // `persisted` so the client can fall back to manual logging.
    // `date` is the Europe/Rome calendar day: the DB default (CURRENT_DATE,
    // UTC) would file a 00:30 Italian meal under the previous day.
    let persisted = false;
    const { error: insertError } = await supabaseUser.from("nutrition_logs").insert({
      athlete_id: user.id,
      date: romeDayFromDate(new Date()),
      meal_name: analysis.mealName,
      calories: analysis.calories,
      protein: analysis.protein,
      carbs: analysis.carbs,
      fats: analysis.fats,
      source: "photo_ai",
      confidence_score: analysis.confidenceScore, // 1-100 int, same scale as the response
      photo_url: null, // Storage upload is out of scope for this slice
    });
    if (insertError) {
      console.error("[analyze-meal-photo] nutrition_logs insert failed", {
        code: insertError.code,
      });
    } else {
      persisted = true;
    }

    // Response contract: unchanged fields + ADDITIVE `persisted` only.
    return new Response(JSON.stringify({ ...analysis, persisted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[analyze-meal-photo] Error:", message);

    // Surface rate limit / quota errors with distinguishable status
    const status = /rate.?limit|quota|429/i.test(message)
      ? 429
      : /timeout|timed out/i.test(message)
        ? 504
        : 500;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
