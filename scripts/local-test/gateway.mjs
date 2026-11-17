// כלי בדיקה מקומי בלבד — לא חלק מהמוצר ולא תחליף ל-Supabase.
// מדמה תת-קבוצה קטנה של ה-API של Supabase מעל Postgres מקומי שעליו הורצו המיגרציות האמיתיות:
//   /auth/v1  — כניסה בסיסמה למשתמשות בדיקה
//   /rest/v1  — select / insert / update / delete / rpc, כשכל בקשה רצה בתפקיד anon או authenticated
//               עם request.jwt.claims — כך ש-RLS, ההרשאות והפונקציות נאכפים באמת במסד.
// /functions ו-/storage אינם קיימים כאן (404), ולכן תכונות ה-AI וההעלאות אינן נבדקות בכלי הזה.
import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";

const SECRET = process.env.JWT_SECRET ?? "local-test-secret";
const USERS = JSON.parse(process.env.TEST_USERS ?? "[]"); // [{id,email,password}]
const PORT = Number(process.env.PORT ?? 54321);
// כמו PostgREST: עמודת date מוחזרת כמחרוזת YYYY-MM-DD ולא כאובייקט Date
pg.types.setTypeParser(1082, (v) => v);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const FK = { books: "book_id", borrowers: "borrower_id" };

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function sign(payload) {
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}
function verify(token) {
  const [h, p, s] = (token ?? "").split(".");
  if (!s) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return expected === s ? JSON.parse(Buffer.from(p, "base64url").toString()) : null;
}
if (process.argv.includes("--print-anon")) {
  console.log(sign({ role: "anon", exp: 4102444800 }));
  process.exit(0);
}

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400 });
  return `"${s}"`;
};
const splitTop = (s) => {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

function whereClause(params, values) {
  const parts = [];
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    const col = ident(key);
    if (op === "is" && val === "null") parts.push(`${col} is null`);
    else if (op === "in") {
      values.push(val.slice(1, -1).split(",").map((v) => v.replace(/^"|"$/g, "")));
      parts.push(`${col}::text = any($${values.length})`);
    } else if (["eq", "gt", "gte", "lt", "lte"].includes(op)) {
      values.push(val);
      parts.push(`${col} ${{ eq: "=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} $${values.length}`);
    } else throw Object.assign(new Error(`unsupported filter ${key}=${raw}`), { status: 400 });
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

async function handleRest(db, method, path, params, body) {
  if (path.startsWith("rpc/")) {
    const fn = path.slice(4);
    const args = body ?? {};
    const keys = Object.keys(args);
    const meta = await db.query(
      `select t.typtype from pg_proc p join pg_type t on t.oid = p.prorettype
        where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
    if (!meta.rows.length) throw Object.assign(new Error("function not found"), { status: 404 });
    const call = `public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ")})`;
    const sql = meta.rows[0].typtype === "c" ? `select row_to_json(t) as r from ${call} t` : `select ${call} as r`;
    const res = await db.query(sql, keys.map((k) => args[k]));
    return res.rows[0]?.r ?? null;
  }

  const table = `public.${ident(path)}`;
  const values = [];
  if (method === "GET") {
    const cols = [], embeds = [];
    for (const part of splitTop(params.get("select") ?? "*")) {
      const m = part.match(/^(\w+):(\w+)\((.+)\)$/);
      if (m) embeds.push({ alias: m[1], table: m[2], cols: m[3].split(",").map((c) => ident(c.trim())) });
      else cols.push(part === "*" ? "*" : ident(part));
    }
    for (const e of embeds) if (!cols.includes("*")) cols.push(ident(FK[e.table]));
    let sql = `select ${cols.join(", ")} from ${table}${whereClause(params, values)}`;
    if (params.get("order")) {
      sql += " order by " + params.get("order").split(",").map((o) => {
        const [c, dir] = o.split(".");
        return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}`;
      }).join(", ");
    }
    if (params.get("limit")) sql += ` limit ${Number(params.get("limit"))}`;
    if (params.get("offset")) sql += ` offset ${Number(params.get("offset"))}`;
    const rows = (await db.query(sql, values)).rows;
    for (const e of embeds) {
      const fk = FK[e.table];
      const ids = [...new Set(rows.map((r) => r[fk]).filter(Boolean))];
      const rel = ids.length
        ? (await db.query(`select id as __id, ${e.cols.join(", ")} from public.${ident(e.table)} where id = any($1)`, [ids])).rows
        : [];
      const byId = new Map(rel.map(({ __id, ...rest }) => [__id, rest]));
      for (const r of rows) r[e.alias] = byId.get(r[fk]) ?? null;
    }
    return rows;
  }
  if (method === "POST") {
    const list = Array.isArray(body) ? body : [body];
    const keys = [...new Set(list.flatMap((o) => Object.keys(o)))].map(ident).join(", ");
    return (await db.query(
      `insert into ${table} (${keys}) select ${keys} from json_populate_recordset(null::${table}, $1::json) returning *`,
      [JSON.stringify(list)])).rows;
  }
  if (method === "PATCH") {
    const keys = Object.keys(body).map(ident).join(", ");
    values.push(JSON.stringify(body));
    const where = whereClause(params, values);
    return (await db.query(
      `update ${table} set (${keys}) = (select ${keys} from json_populate_record(null::${table}, $1::json))${where} returning *`,
      values)).rows;
  }
  if (method === "DELETE") {
    return (await db.query(`delete from ${table}${whereClause(params, values)} returning *`, values)).rows;
  }
  throw Object.assign(new Error("method not allowed"), { status: 405 });
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
};
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {} });

http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { ...cors, "Content-Type": "application/json" });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(204);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  const url = new URL(req.url, "http://x");
  const claims = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));

  if (url.pathname === "/auth/v1/token") {
    const { email, password } = JSON.parse(raw || "{}");
    const u = USERS.find((x) => x.email === email && x.password === password);
    if (!u) return send(400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return send(200, {
      access_token: sign({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, exp }),
      token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "local-test", user: userJson(u),
    });
  }
  if (url.pathname === "/auth/v1/user") {
    const u = claims && USERS.find((x) => x.id === claims.sub);
    return u ? send(200, userJson(u)) : send(401, { msg: "invalid token" });
  }
  if (url.pathname === "/auth/v1/logout") return send(204);

  if (url.pathname.startsWith("/rest/v1/")) {
    const role = claims?.role === "authenticated" ? "authenticated" : "anon";
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)", [
        JSON.stringify(claims ?? { role: "anon" }),
        JSON.stringify({ "x-forwarded-for": req.headers["x-test-ip"] ?? "127.0.0.1" }),
      ]);
      await db.query(`set local role ${role}`);
      let out = await handleRest(db, req.method, url.pathname.slice("/rest/v1/".length), url.searchParams, raw ? JSON.parse(raw) : undefined);
      await db.query("commit");
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object") && Array.isArray(out)) {
        if (out.length !== 1) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        out = out[0];
      }
      return send(req.method === "POST" && !url.pathname.includes("/rpc/") ? 201 : 200, out);
    } catch (e) {
      await db.query("rollback").catch(() => {});
      return send(e.status ?? (e.code === "42501" ? 403 : 400), { message: e.message, code: e.code ?? null });
    } finally {
      db.release();
    }
  }
  return send(404, { message: "not available in local test gateway" });
}).listen(PORT, () => console.log(`local test gateway on :${PORT}`));
