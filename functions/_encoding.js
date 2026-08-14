// Standard base64 uses +, /, and = which aren't safe in a Telegram deep-link
// payload (Telegram only allows letters, digits, underscore, hyphen). This
// is the URL-safe variant, used to embed an email address into a
// t.me/<bot>?start=otp_<encoded> link.

export function base64UrlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(encoded) {
  let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}
