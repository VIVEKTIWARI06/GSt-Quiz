import { json, badRequest, unauthorized } from "../../_utils.js";

function checkAdmin(request, env) {
  const provided = request.headers.get("x-admin-password") || "";
  return env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");
  const body = await request.json().catch(() => ({}));
  const { course_id, active } = body;
  if (!course_id) return badRequest("course_id is required");

  await env.DB.prepare("UPDATE courses SET active = ? WHERE id = ?")
    .bind(active ? 1 : 0, course_id).run();

  return json({ ok: true, course_id, active: !!active });
}
