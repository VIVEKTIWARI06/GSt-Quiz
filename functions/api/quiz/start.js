import { json, badRequest, unauthorized, requireAuth } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const courseId = (body.course_id || "").trim();
  if (!courseId) return badRequest("course_id is required");

  const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ? AND active = 1")
    .bind(courseId).first();
  if (!course) return badRequest("Unknown course");

  // Randomly sample question_count questions from this course's bank.
  // (D1 is SQLite under the hood, so ORDER BY RANDOM() works fine at this scale.)
  const { results: questions } = await env.DB.prepare(
    `SELECT id, question_text, option_a, option_b, option_c, option_d
     FROM questions WHERE course_id = ? AND active = 1
     ORDER BY RANDOM() LIMIT ?`
  ).bind(courseId, course.question_count).all();

  if (questions.length < course.question_count) {
    return badRequest(
      `Course "${course.name}" needs ${course.question_count} questions but only has ${questions.length}. Add more questions to the bank.`
    );
  }

  const attemptId = crypto.randomUUID();
  const questionIds = questions.map((q) => q.id);

  await env.DB.prepare(
    `INSERT INTO attempts (id, student_id, course_id, question_ids) VALUES (?, ?, ?, ?)`
  ).bind(attemptId, auth.sid, courseId, JSON.stringify(questionIds)).run();

  return json({
    ok: true,
    attempt_id: attemptId,
    course: { id: course.id, name: course.name, time_limit_min: course.time_limit_min },
    questions, // no correct_option included — never leaked to client
  });
}
