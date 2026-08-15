import { json, badRequest, signToken, sendTelegramMessage } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const code = (body.code || "").trim();

  if (!email || !code) return badRequest("email and code are required");

  // Emergency bypass: admin-managed via the /admin panel (stored in D1, not
  // a Cloudflare secret, so it's viewable/regeneratable without the CLI).
  // If the student enters this instead of their real OTP, let them straight
  // through — the "everything else is down" last resort.
  const bypassRow = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'bypass_code'"
  ).first();
  const isBypass = bypassRow?.value && code === bypassRow.value;

  if (!isBypass) {
    const otp = await env.DB.prepare(
      `SELECT * FROM otp_codes WHERE email = ? AND code = ? AND consumed = 0
       ORDER BY id DESC LIMIT 1`
    ).bind(email, code).first();

    if (!otp) return badRequest("Invalid code");
    if (new Date(otp.expires_at) < new Date()) return badRequest("Code expired, please request a new one");

    await env.DB.prepare("UPDATE otp_codes SET consumed = 1 WHERE id = ?").bind(otp.id).run();
  }

  const student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();
  if (!student) return badRequest("Student not found");

  await env.DB.prepare("UPDATE students SET email_verified = 1 WHERE id = ?").bind(student.id).run();

  if (isBypass) {
    // Flag every bypass use so you have visibility into when/why it's being used.
    await sendTelegramMessage(env, `⚠️ <b>Emergency bypass code used</b>\nStudent: ${student.name} (${email})`);
  }

  const token = await signToken(
    { sid: student.id, email, exp: Date.now() + 4 * 60 * 60 * 1000 }, // 4 hour session
    env.SESSION_SECRET
  );

  return json({ ok: true, token, student: { name: student.name, email: student.email } });
}
