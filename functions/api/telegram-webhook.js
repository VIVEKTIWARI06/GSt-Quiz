import { json, sendTelegramDocument, sendTelegramMessage } from "../_utils.js";
import { generateCertificatePdf, bytesToBase64 } from "../_certificate.js";
import { base64UrlDecode } from "../_encoding.js";

// Telegram can only DM a user after that user has messaged the bot at least
// once — bots can't cold-DM anyone (this is a Telegram platform rule, not a
// Cloudflare limit). So both flows below work the same way: the frontend
// gives the student a t.me deep link with a payload, they tap it and hit
// Start, Telegram POSTs that here, and we act on the payload.
//
//   Certificate:  t.me/<bot>?start=<attempt_id>            (a UUID, no prefix)
//   OTP delivery: t.me/<bot>?start=otp_<base64url(email)>  ("otp_" prefix)
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
    await sendReplyToChat(env, chatId, "Send your certificate link, or the 'get code on Telegram' link from the quiz site, to use this bot.");
    return json({ ok: true });
  }

  const payload = text.split(" ")[1];
  if (!payload) {
    await sendReplyToChat(env, chatId, "Missing link reference — please use a link from the quiz site rather than messaging directly.");
    return json({ ok: true });
  }

  if (payload.startsWith("otp_")) {
    await handleOtpDelivery(env, chatId, payload.slice(4));
  } else {
    await handleCertificateDelivery(env, chatId, payload);
  }

  return json({ ok: true });
}

async function handleOtpDelivery(env, chatId, encodedEmail) {
  let email;
  try {
    email = base64UrlDecode(encodedEmail).toLowerCase();
  } catch {
    await sendReplyToChat(env, chatId, "That link looks malformed — go back to the quiz site and tap 'Get code on Telegram' again.");
    return;
  }

  const otp = await env.DB.prepare(
    `SELECT * FROM otp_codes WHERE email = ? AND consumed = 0
     ORDER BY id DESC LIMIT 1`
  ).bind(email).first();

  if (!otp || new Date(otp.expires_at) < new Date()) {
    await sendReplyToChat(env, chatId, "No active verification code found for that email — go back to the quiz site and request a new one (or resend it), then tap the Telegram link again.");
    return;
  }

  await sendReplyToChat(env, chatId,
    `Your verification code is:\n\n${otp.code}\n\nEnter this on the quiz site. It expires in a few minutes.`
  );
}

async function handleCertificateDelivery(env, chatId, attemptId) {
  const attempt = await env.DB.prepare("SELECT * FROM attempts WHERE id = ?").bind(attemptId).first();
  if (!attempt || attempt.status !== "submitted" || !attempt.passed) {
    await sendReplyToChat(env, chatId, "We couldn't find a passing, submitted attempt for that link.");
    return;
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
}

async function sendReplyToChat(env, chatId, text) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}
