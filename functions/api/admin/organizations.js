import { json, badRequest, unauthorized } from "../../_utils.js";

function checkAdmin(request, env) {
  const provided = request.headers.get("x-admin-password") || "";
  return env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

export async function onRequestGet({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.name, o.logo_url, o.active,
            (SELECT COUNT(*) FROM courses c WHERE c.organization_id = o.id AND c.active = 1) AS course_count
     FROM organizations o ORDER BY o.name`
  ).all();

  return json({ organizations: results });
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");

  const body = await request.json().catch(() => ({}));
  const { id, name, logo_url } = body;
  if (!id || !name) return badRequest("id and name are required");
  if (!/^[a-z0-9-]+$/.test(id)) return badRequest("id must be lowercase letters, numbers, and hyphens only (this becomes part of the shareable URL)");

  await env.DB.prepare(
    `INSERT INTO organizations (id, name, logo_url, active) VALUES (?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, logo_url = excluded.logo_url, active = 1`
  ).bind(id, name, logo_url || null).run();

  return json({ ok: true, id, share_url: `/take-test/?org=${id}` });
}
