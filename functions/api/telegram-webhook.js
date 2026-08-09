import { json, sendTelegramDocument, sendTelegramMessage } from "../_utils.js";
import { generateCertificatePdf, bytesToBase64 } from "../_certificate.js";

// Telegram can only DM a user after that user has messaged the bot at least
// once — bots can't cold-DM anyone (this is a Telegram platform rule, not a
// Cloudflare limit). So the flow is:
//   1. After a passing score, the frontend shows a button:
//      https://t.me/<YourBotUsername>?start=<attempt_id>
//   2. Student taps it, Telegram opens a chat with the bot and sends "/start <attempt_id>"
//   3. Telegram POSTs that message to THIS webhook
//   4. We look up the attempt, generate the certificate, and send it straight
//      back to that chat with sendDocument.
//
// One-time setup (see README): register this URL with
// https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://gstreturn.org/api/telegram-webhook

export async function onRequestPost({ request, env }) {
  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (!message || !message.text) return json({ ok: true }); // ignore non-text updates

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (!text.startsWith("/start")) {
    await sendReplyToChat(env, chatId, "Send your certificate link from the quiz results page to receive your certificate here.");
    return json({ ok: true });
  }

  const attemptId = text.split(" ")[1];
  if (!attemptId) {
    await sendReplyToChat(env, chatId, "Missing attempt reference — please use the certificate link shown on your results page.");
    return json({ ok: true });
  }

  const attempt = await env.DB.prepare("SELECT * FROM attempts WHERE id = ?").bind(attemptId).first();
  if (!attempt || attempt.status !== "submitted" || !attempt.passed) {
    await sendReplyToChat(env, chatId, "We couldn't find a passing, submitted attempt for that link.");
    return json({ ok: true });
  }

  const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ?").bind(attempt.course_id).first();
  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(attempt.student_id).first();

  const pdfBytes = await generateCertificatePdf({
    studentName: student.name,
    courseName: course.name,
    percent: attempt.percent,
    dateStr: new Date(attempt.submitted_at).toLocaleDateString("en-IN", {
      year: "numeric", month: "long", day: "numeric",
    }),
  });
  const base64 = bytesToBase64(pdfBytes);

  await sendTelegramDocument(
    { TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN },
    chatId,
    base64,
    `Certificate-${course.name.replace(/\s+/g, "-")}.pdf`,
    `🎉 Congratulations ${student.name}! Here's your certificate for ${course.name} (${attempt.percent}%).`
  );

  await env.DB.prepare("UPDATE attempts SET certificate_sent = 1 WHERE id = ?").bind(attemptId).run();

  return json({ ok: true });
}

async function sendReplyToChat(env, chatId, text) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}
