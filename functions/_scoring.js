import { sendTelegramMessage, pushToSheet } from "./_utils.js";

// Scores an in-progress attempt, marks it submitted, notifies Telegram/Sheet,
// and returns the result payload. Used by both /api/submit (manual) and
// /api/quiz/resume (auto-submit when the time limit has expired while the
// student was away).
export async function finalizeAttempt(env, attempt) {
  const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ?").bind(attempt.course_id).first();
  const questionIds = JSON.parse(attempt.question_ids);

  const { results: correctRows } = await env.DB.prepare(
    `SELECT id, correct_option FROM questions WHERE id IN (${questionIds.map(() => "?").join(",")})`
  ).bind(...questionIds).all();
  const correctMap = Object.fromEntries(correctRows.map((r) => [r.id, r.correct_option]));

  const { results: answerRows } = await env.DB.prepare(
    "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?"
  ).bind(attempt.id).all();
  const answerMap = Object.fromEntries(answerRows.map((r) => [r.question_id, r.selected_option]));

  let score = 0;
  for (const qid of questionIds) {
    if (answerMap[qid] && answerMap[qid] === correctMap[qid]) score++;
  }
  const total = questionIds.length;
  const percent = Math.round((score / total) * 10000) / 100;
  const passed = percent >= course.pass_percent ? 1 : 0;

  await env.DB.prepare(
    `UPDATE attempts SET status = 'submitted', score = ?, total = ?, percent = ?, passed = ?, submitted_at = datetime('now')
     WHERE id = ?`
  ).bind(score, total, percent, passed, attempt.id).run();

  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(attempt.student_id).first();

  await sendTelegramMessage(env,
    `📝 <b>Quiz submitted</b>\nCourse: ${course.name}\nName: ${student.name}\nEmail: ${student.email}\nScore: ${score}/${total} (${percent}%)\nResult: ${passed ? "✅ PASS" : "❌ FAIL"}`
  );

  await pushToSheet(env, {
    type: "result",
    name: student.name,
    email: student.email,
    mobile: student.mobile,
    course: course.name,
    score, total, percent,
    passed: !!passed,
    timestamp: new Date().toISOString(),
  });

  return {
    score, total, percent, passed: !!passed,
    course_name: course.name,
    student_name: student.name,
  };
}

export function pickStoredResult(attempt, courseName, studentName) {
  return {
    score: attempt.score, total: attempt.total, percent: attempt.percent,
    passed: !!attempt.passed,
    course_name: courseName,
    student_name: studentName,
  };
}
