import { json, badRequest, unauthorized, requireAuth } from "../../_utils.js";
import { finalizeAttempt, pickStoredResult } from "../../_scoring.js";

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

  const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ?").bind(attempt.course_id).first();
  const student = await env.DB.prepare("SELECT name FROM students WHERE id = ?").bind(auth.sid).first();

  // Already finished (e.g. they closed the tab right after submitting, before
  // seeing the result screen) — just hand back the stored result.
  if (attempt.status === "submitted") {
    return json({ ok: true, submitted: true, ...pickStoredResult(attempt, course?.name, student?.name) });
  }

  // Still in progress — check whether the time limit expired while they were away.
  // started_at is stored as UTC via SQLite's datetime('now'); append 'Z' so
  // JS parses it as UTC rather than local time.
  const startedAtMs = Date.parse(attempt.started_at.replace(" ", "T") + "Z");
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  const limitSec = course.time_limit_min * 60;
  const remainingSec = Math.floor(limitSec - elapsedSec);

  if (remainingSec <= 0) {
    // Time's up while they were away — auto-submit with whatever was answered.
    const result = await finalizeAttempt(env, attempt);
    return json({ ok: true, submitted: true, time_expired: true, ...result });
  }

  // Genuinely resumable — hand back the same question set (no reshuffling)
  // plus whatever answers were already autosaved, and the real remaining time.
  const questionIds = JSON.parse(attempt.question_ids);
  const { results: questions } = await env.DB.prepare(
    `SELECT id, question_text, option_a, option_b, option_c, option_d
     FROM questions WHERE id IN (${questionIds.map(() => "?").join(",")})`
  ).bind(...questionIds).all();
  // Preserve original serving order (SQL IN () doesn't guarantee it)
  const questionMap = Object.fromEntries(questions.map((q) => [q.id, q]));
  const orderedQuestions = questionIds.map((id) => questionMap[id]).filter(Boolean);

  const { results: answerRows } = await env.DB.prepare(
    "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?"
  ).bind(attempt_id).all();
  const answers = Object.fromEntries(answerRows.map((r) => [r.question_id, r.selected_option]));

  return json({
    ok: true,
    submitted: false,
    attempt_id: attempt.id,
    course: { id: course.id, name: course.name, time_limit_min: course.time_limit_min },
    questions: orderedQuestions,
    answers,
    remaining_seconds: remainingSec,
  });
}
