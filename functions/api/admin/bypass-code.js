import { json, unauthorized } from "../../_utils.js";

function checkAdmin(request, env) {
  const provided = request.headers.get("x-admin-password") || "";
  return env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing O/0, I/1
  let code = "GST-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function onRequestGet({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");
  const row = await env.DB.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'bypass_code'").first();
  return json({ code: row?.value || null, updated_at: row?.updated_at || null });
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");
  const code = generateCode();
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('bypass_code', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(code).run();
  return json({ ok: true, code });
}
