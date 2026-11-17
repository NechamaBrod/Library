import { createClient, FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey && !url.includes("YOUR-PROJECT"));

// כשאין הגדרות, האפליקציה מציגה מסך הסבר ואינה ניגשת ללקוח כלל.
export const supabase: SupabaseClient = isConfigured
  ? createClient(url!, anonKey!)
  : (null as unknown as SupabaseClient);

/** שליפת כל השורות בדפים של 1000 (מגבלת ברירת המחדל של ה-API). */
export async function fetchAll<T>(
  table: string,
  select = "*",
  order: { column: string; ascending?: boolean } = { column: "created_at" },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(order.column, { ascending: order.ascending ?? true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export type FnResult<T> = { ok: true; data: T } | { ok: false; code: string };

/** קריאה ל-Edge Function עם קוד שגיאה אחיד. */
export async function callFunction<T>(name: string, body?: unknown): Promise<FnResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(
      name,
      body === undefined ? { method: "GET" } : { body: body as Record<string, unknown> },
    );
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response;
        let code: string | undefined;
        try {
          code = (await res.json())?.error;
        } catch {
          /* not JSON */
        }
        return { ok: false, code: typeof code === "string" ? code : res.status === 404 ? "not_deployed" : "server_error" };
      }
      return { ok: false, code: "unreachable" };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}

export type AiStatus = "checking" | "ready" | "not_configured" | "not_deployed";

export async function checkAi(name: string): Promise<AiStatus> {
  const res = await callFunction<{ configured?: boolean }>(name);
  if (!res.ok) return "not_deployed";
  return res.data?.configured ? "ready" : "not_configured";
}
