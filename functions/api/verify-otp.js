import { json, badRequest, signToken } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const code = (body.code || "").trim();

  if (!email || !code) return badRequest("email and code are required");

  const otp = await env.DB.prepare(
    `SELECT * FROM otp_codes WHERE email = ? AND code = ? AND consumed = 0
     ORDER BY id DESC LIMIT 1`
  ).bind(email, code).first();

  if (!otp) return badRequest("Invalid code");
  if (new Date(otp.expires_at) < new Date()) return badRequest("Code expired, please request a new one");

  await env.DB.prepare("UPDATE otp_codes SET consumed = 1 WHERE id = ?").bind(otp.id).run();

  const student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();
  if (!student) return badRequest("Student not found");

  await env.DB.prepare("UPDATE students SET email_verified = 1 WHERE id = ?").bind(student.id).run();

  const token = await signToken(
    { sid: student.id, email, exp: Date.now() + 4 * 60 * 60 * 1000 }, // 4 hour session
    env.SESSION_SECRET
  );

  return json({ ok: true, token, student: { name: student.name, email: student.email } });
}
