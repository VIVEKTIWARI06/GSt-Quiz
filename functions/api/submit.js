import { json, badRequest, unauthorized, requireAuth } from "../_utils.js";
import { finalizeAttempt, pickStoredResult } from "../_scoring.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { attempt_id } = body;
  if (!attempt_id) return badRequest("attempt_id is required");

  const attempt = await env.DB.prepare(
    "SELECT * FROM attempts WHERE id = ? AND student_id = ?"
  ).bind(attempt_id, auth.sid).first();
  if (!attempt) return badRequest("Attempt not found");

  if (attempt.status === "submitted") {
    // Idempotent: if already submitted (e.g. resumed after auto-submit), just return the existing result
    const course = await env.DB.prepare("SELECT name FROM courses WHERE id = ?").bind(attempt.course_id).first();
    const student = await env.DB.prepare("SELECT name FROM students WHERE id = ?").bind(auth.sid).first();
    return json({ ok: true, ...pickStoredResult(attempt, course?.name, student?.name) });
  }

  const result = await finalizeAttempt(env, attempt);
  return json({ ok: true, ...result });
}
