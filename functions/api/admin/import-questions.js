import { json, badRequest, unauthorized } from "../../_utils.js";
import { parseCsv } from "../../_csv.js";

// Simple admin auth: the client sends the admin password in the
// x-admin-password header. Set ADMIN_PASSWORD as a secret:
//   npx wrangler secret put ADMIN_PASSWORD
function checkAdmin(request, env) {
  const provided = request.headers.get("x-admin-password") || "";
  return env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");

  const body = await request.json().catch(() => ({}));
  const { course, csv, replace_existing } = body;

  if (!course || !course.id || !course.name || !course.question_count) {
    return badRequest("course.id, course.name and course.question_count are required");
  }
  if (!csv || typeof csv !== "string") {
    return badRequest("csv (raw text) is required");
  }

  // ---- Upsert the course ----
  await env.DB.prepare(
    `INSERT INTO courses (id, name, question_count, pass_percent, time_limit_min, active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       question_count = excluded.question_count,
       pass_percent = excluded.pass_percent,
       time_limit_min = excluded.time_limit_min,
       active = 1`
  ).bind(
    course.id,
    course.name,
    course.question_count,
    course.pass_percent ?? 60,
    course.time_limit_min ?? 60
  ).run();

  // ---- Parse the CSV ----
  const rows = parseCsv(csv);
  if (rows.length === 0) return badRequest("CSV had no data rows");

  if (replace_existing) {
    await env.DB.prepare("DELETE FROM questions WHERE course_id = ?").bind(course.id).run();
  }

  const errors = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // account for header row, 1-indexed

    const questionText = r.question;
    const opts = [r.option_1, r.option_2, r.option_3, r.option_4];
    const correctText = r.correct_option;

    if (!questionText || opts.some((o) => !o) || !correctText) {
      errors.push(`Row ${rowNum}: missing question text, an option, or correct_option`);
      continue;
    }

    // correct_option in the CSV is the full text of the right answer,
    // not a letter — match it against option_1..4 to find A/B/C/D.
    const matchIndex = opts.findIndex(
      (o) => o.trim().toLowerCase() === correctText.trim().toLowerCase()
    );
    if (matchIndex === -1) {
      errors.push(`Row ${rowNum}: correct_option "${correctText}" doesn't match any of the 4 options`);
      continue;
    }
    const correctLetter = ["A", "B", "C", "D"][matchIndex];

    await env.DB.prepare(
      `INSERT INTO questions (course_id, question_text, option_a, option_b, option_c, option_d, correct_option, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(course.id, questionText, opts[0], opts[1], opts[2], opts[3], correctLetter).run();

    inserted++;
  }

  const { results: countRows } = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM questions WHERE course_id = ? AND active = 1"
  ).bind(course.id).all();
  const totalInBank = countRows[0]?.n ?? 0;

  return json({
    ok: true,
    course_id: course.id,
    rows_read: rows.length,
    inserted,
    skipped: rows.length - inserted,
    total_questions_in_bank: totalInBank,
    errors: errors.slice(0, 20), // cap so the response doesn't explode on a bad file
  });
}
