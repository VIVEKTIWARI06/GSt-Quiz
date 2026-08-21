import { json, badRequest, generateOtp, sendEmail, sendTelegramMessage } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const mobile = (body.mobile || "").trim();

  if (!name || !email || !mobile) return badRequest("name, email and mobile are required");
  if (!/^\S+@\S+\.\S+$/.test(email)) return badRequest("Invalid email address");

  let student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();
  if (!student) {
    const res = await env.DB.prepare(
      "INSERT INTO students (name, email, mobile) VALUES (?, ?, ?)"
    ).bind(name, email, mobile).run();
    student = { id: res.meta.last_row_id };
  } else {
    await env.DB.prepare("UPDATE students SET name = ?, mobile = ? WHERE id = ?")
      .bind(name, mobile, student.id).run();
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)"
  ).bind(email, code, expiresAt).run();

  const emailed = await sendEmail(env, {
    to: email,
    subject: `Your GST Simulator access code: ${code}`,
    html: `<p>Hi ${name},</p><p>Your verification code for the GST Simulator is:</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
           <p>This code expires in 10 minutes.</p>`,
  });

  await sendTelegramMessage(env, `🎓 <b>Simulator lead</b>\nName: ${name}\nEmail: ${email}\nMobile: ${mobile}`);

  return json({ ok: true, email_sent: emailed });
}
