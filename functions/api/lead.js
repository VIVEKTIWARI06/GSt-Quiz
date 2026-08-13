import { json, badRequest, generateOtp, sendEmail, sendTelegramMessage, pushToSheet } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const mobile = (body.mobile || "").trim();
  const courseId = (body.course_id || "").trim();

  if (!name || !email || !mobile || !courseId) {
    return badRequest("name, email, mobile and course_id are all required");
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return badRequest("Invalid email address");

  const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ? AND active = 1")
    .bind(courseId).first();
  if (!course) return badRequest("Unknown course");

  // Upsert student
  let student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();
  if (!student) {
    const res = await env.DB.prepare(
      "INSERT INTO students (name, email, mobile) VALUES (?, ?, ?)"
    ).bind(name, email, mobile).run();
    student = { id: res.meta.last_row_id, name, email, mobile, email_verified: 0 };
  } else {
    // keep name/mobile fresh in case they retake with updated details
    await env.DB.prepare("UPDATE students SET name = ?, mobile = ? WHERE id = ?")
      .bind(name, mobile, student.id).run();
  }

  // Generate + store OTP (10 minute expiry)
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)"
  ).bind(email, code, expiresAt).run();

  const emailed = await sendEmail(env, {
    to: email,
    subject: `Your verification code: ${code}`,
    html: `<p>Hi ${escapeHtml(name)},</p>
           <p>Your verification code for the <strong>${escapeHtml(course.name)}</strong> quiz is:</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
           <p>This code expires in 10 minutes.</p>`,
  });

  await sendTelegramMessage(env,
    `🆕 <b>New lead</b>\nCourse: ${course.name}\nName: ${name}\nEmail: ${email}\nMobile: ${mobile}`
  );

  await pushToSheet(env, {
    type: "lead",
    name, email, mobile,
    course: course.name,
    timestamp: new Date().toISOString(),
  });

  return json({ ok: true, email_sent: emailed });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
