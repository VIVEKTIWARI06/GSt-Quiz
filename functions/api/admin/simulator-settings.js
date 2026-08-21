import { json, badRequest, unauthorized } from "../../_utils.js";

function checkAdmin(request, env) {
  const provided = request.headers.get("x-admin-password") || "";
  return env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");
  const body = await request.json().catch(() => ({}));
  const login_required = !!body.login_required;
  const free_seconds = Number.isFinite(body.free_seconds) ? Math.max(0, body.free_seconds) : 120;
  const value = JSON.stringify({ login_required, free_seconds });

  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('simulator_gate', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(value).run();

  return json({ ok: true, login_required, free_seconds });
}
