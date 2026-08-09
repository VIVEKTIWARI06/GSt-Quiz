import { json, badRequest, unauthorized, requireAuth, sendEmail } from "../_utils.js";
import { generateCertificatePdf, bytesToBase64 } from "../_certificate.js";

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
  if (attempt.status !== "submitted") return badRequest("Attempt not submitted yet");
  if (!attempt.passed) return badRequest("Certificate only available for a passing score");

  const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ?").bind(attempt.course_id).first();
  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(auth.sid).first();

  const pdfBytes = await generateCertificatePdf({
    studentName: student.name,
    courseName: course.name,
    percent: attempt.percent,
    dateStr: new Date(attempt.submitted_at).toLocaleDateString("en-IN", {
      year: "numeric", month: "long", day: "numeric",
    }),
  });
  const base64 = bytesToBase64(pdfBytes);
  const filename = `Certificate-${course.name.replace(/\s+/g, "-")}.pdf`;

  const emailed = await sendEmail(env, {
    to: student.email,
    subject: `Your certificate — ${course.name}`,
    html: `<p>Hi ${student.name},</p>
           <p>Congratulations on passing <strong>${course.name}</strong> with a score of ${attempt.percent}%!</p>
           <p>Your certificate is attached.</p>`,
    attachment: { filename, base64 },
  });

  await env.DB.prepare("UPDATE attempts SET certificate_sent = 1 WHERE id = ?").bind(attempt_id).run();

  // Also return the PDF as base64 so the frontend can offer an instant download
  // and a "send to Telegram" button (see telegram-webhook.js for the Telegram half).
  return json({ ok: true, emailed, filename, pdf_base64: base64 });
}
