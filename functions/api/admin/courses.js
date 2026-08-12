import { json, unauthorized } from "../../_utils.js";

function checkAdmin(request, env) {
  const provided = request.headers.get("x-admin-password") || "";
  return env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

export async function onRequestGet({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.question_count, c.pass_percent, c.time_limit_min, c.active,
            c.organization_id, o.name AS organization_name,
            (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id AND q.active = 1) AS bank_size,
            (SELECT COUNT(*) FROM attempts a WHERE a.course_id = c.id AND a.status = 'submitted') AS attempts_completed
     FROM courses c
     LEFT JOIN organizations o ON o.id = c.organization_id
     ORDER BY c.name`
  ).all();

  return json({ courses: results });
}
