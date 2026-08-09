// Shared helpers for all /functions/api/* endpoints.
// Cloudflare Pages Functions run on the Workers runtime, so Web Crypto,
// fetch, etc. are all natively available — no npm installs needed.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function badRequest(message) {
  return json({ error: message }, 400);
}

export function unauthorized(message = "Not authorized") {
  return json({ error: message }, 401);
}

// ---------- Session tokens (HMAC-signed, no external deps) ----------
// Token payload: { sid: student_id, email, exp } base64url-encoded,
// signed with SESSION_SECRET. Sent by the client as: Authorization: Bearer <token>

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64url(obj) {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  return JSON.parse(atob(str.replace(/-/g, "+").replace(/_/g, "/")));
}

export async function signToken(payload, secret) {
  const body = b64url(payload);
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function verifyToken(token, secret) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(secret, body);
  if (expected !== sig) return null;
  const payload = unb64url(body);
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

export async function requireAuth(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return verifyToken(token, env.SESSION_SECRET);
}

// ---------- OTP ----------
export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// ---------- Resend (email) ----------
// Free tier: https://resend.com — 100 emails/day, 3000/month.
// Set RESEND_API_KEY in Pages > Settings > Environment variables.
export async function sendEmail(env, { to, subject, html, attachment }) {
  const body = {
    from: env.FROM_EMAIL || "GST Quiz <onboarding@resend.dev>",
    to: [to],
    subject,
    html,
  };
  if (attachment) {
    body.attachments = [
      { filename: attachment.filename, content: attachment.base64 },
    ];
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("Resend error", await res.text());
  }
  return res.ok;
}

// ---------- Telegram ----------
// Create a bot via @BotFather, get TELEGRAM_BOT_TOKEN.
// Get your chat id by messaging the bot then visiting:
// https://api.telegram.org/bot<token>/getUpdates
export async function sendTelegramMessage(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
    }),
  });
  return res.ok;
}

// Sends a document to a specific chat (used for handing the certificate
// back to the STUDENT over Telegram, if they gave a chat id — see certificate.js)
export async function sendTelegramDocument(env, chatId, base64, filename, caption) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return false;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption || "");
  form.append("document", new Blob([bytes], { type: "application/pdf" }), filename);
  const res = await fetch(url, { method: "POST", body: form });
  return res.ok;
}

// ---------- Google Sheet backup (Apps Script Web App) ----------
export async function pushToSheet(env, payload) {
  if (!env.GAS_WEBHOOK_URL) return false;
  try {
    await fetch(env.GAS_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (e) {
    console.error("Sheet push failed", e);
    return false;
  }
}
