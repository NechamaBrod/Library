// קוד משותף ל-Edge Functions. רץ בצד השרת בלבד.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^1.8.0";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export const AI_MODEL = Deno.env.get("AI_MODEL") ?? "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
}

export function anthropic(): Anthropic {
  return new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
}

/** לקוח עם מפתח השירות — עוקף RLS. לעולם לא נשלח לדפדפן. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** מחזיר את מזהה המשתמשת אם היא מנהלת, אחרת null. */
export async function requireAdmin(req: Request, db: SupabaseClient): Promise<string | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: row } = await db
    .from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return row ? data.user.id : null;
}

export async function clientIpHash(req: Request): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** true אם מותר להמשיך. כשל בבדיקה עצמה נחשב חסימה (fail closed). */
export async function rateLimit(
  db: SupabaseClient, kind: string, key: string, max: number, windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await db.rpc("consume_rate_limit", {
    p_kind: kind, p_key: key, p_max: max, p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed", error.message);
    return false;
  }
  return data === true;
}

/**
 * קריאה למודל עם פלט מובנה. מחזירה את הטקסט הגולמי של ה-JSON, או קוד כשל.
 * נעשה שימוש ב-fallbacks בצד השרת: אם המודל הראשי מסרב, הבקשה מנותבת אוטומטית למודל חלופי.
 */
export async function callModel(params: {
  system: Anthropic.Beta.Messages.BetaTextBlockParam[];
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  // deno-lint-ignore no-explicit-any
  format: any;
}): Promise<{ ok: true; text: string } | { ok: false; code: string }> {
  try {
    const response = await anthropic().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: params.format },
      system: params.system,
      messages: [{ role: "user", content: params.content }],
    });
    if (response.stop_reason === "refusal") return { ok: false, code: "ai_refused" };
    if (response.stop_reason === "max_tokens") return { ok: false, code: "ai_invalid_output" };
    const text = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text).join("");
    if (!text) return { ok: false, code: "ai_invalid_output" };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("AI auth error");
      return { ok: false, code: "ai_bad_key" };
    }
    if (error instanceof Anthropic.RateLimitError) return { ok: false, code: "ai_busy" };
    if (error instanceof Anthropic.BadRequestError) {
      console.error("AI bad request", error.message);
      return { ok: false, code: "ai_bad_request" };
    }
    if (error instanceof Anthropic.APIError) {
      console.error("AI API error", error.status, error.message);
      return { ok: false, code: "ai_unavailable" };
    }
    console.error("AI call failed", error);
    return { ok: false, code: "ai_unavailable" };
  }
}
