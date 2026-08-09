import { json, badRequest, unauthorized, requireAuth } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { attempt_id, question_id, selected_option } = body;
  if (!attempt_id || !question_id || !["A", "B", "C", "D"].includes(selected_option)) {
    return badRequest("attempt_id, question_id and a valid selected_option are required");
  }

  const attempt = await env.DB.prepare(
    "SELECT * FROM attempts WHERE id = ? AND student_id = ?"
  ).bind(attempt_id, auth.sid).first();
  if (!attempt) return badRequest("Attempt not found");
  if (attempt.status !== "in_progress") return badRequest("Attempt already submitted");

  // Upsert the answer (student can change their mind before submitting)
  await env.DB.prepare(
    `INSERT INTO answers (attempt_id, question_id, selected_option)
     VALUES (?, ?, ?)
     ON CONFLICT(attempt_id, question_id) DO UPDATE SET selected_option = excluded.selected_option`
  ).bind(attempt_id, question_id, selected_option).run();

  return json({ ok: true });
}
