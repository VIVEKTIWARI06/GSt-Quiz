import { sendEmail } from "./_utils.js";

// The Worker's own runtime CAN read its secrets from env (even though the
// wrangler CLI/dashboard can never show them back to a human once set) —
// so we use that legitimate access to include a full secrets snapshot in
// the backup email. This deliberately does NOT go to InterServer, to keep
// that second channel lower-risk (just database data, no credentials).
const SECRET_NAMES = [
  "ADMIN_PASSWORD", "RESEND_API_KEY", "FROM_EMAIL", "BACKUP_EMAIL",
  "SESSION_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
  "GAS_WEBHOOK_URL", "INTERSERVER_BACKUP_URL", "INTERSERVER_BACKUP_SECRET",
];

function snapshotSecrets(env) {
  const snapshot = {};
  for (const name of SECRET_NAMES) {
    snapshot[name] = env[name] || "(not set)";
  }
  return snapshot;
}

// Pulls every table into one JSON object and emails it as a downloadable
// attachment. Used both by the weekly Cron Trigger and the admin "Backup now" button.
export async function runBackup(env) {
  const tables = ["courses", "questions", "students", "attempts", "answers", "organizations"];
  const backup = { generated_at: new Date().toISOString() };

  for (const t of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${t}`).all();
    backup[t] = results;
  }

  const dataJson = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const counts = tables.map((t) => `${t}: ${backup[t].length}`).join(", ");

  let emailed = false;
  if (env.BACKUP_EMAIL) {
    // The email version includes both the database AND a full secrets
    // snapshot, so this one email is a complete "everything you'd need"
    // recovery package.
    const fullBackup = { ...backup, current_secrets: snapshotSecrets(env) };
    const emailJson = JSON.stringify(fullBackup, null, 2);
    const emailBase64 = btoa(unescape(encodeURIComponent(emailJson)));
    const filename = `gst-quiz-full-backup-${dateStr}.json`;

    emailed = await sendEmail(env, {
      to: env.BACKUP_EMAIL,
      subject: `GST Quiz backup — ${dateStr}`,
      html: `<p>Weekly backup attached — includes database AND current secret values.</p>
             <p>Row counts — ${counts}</p>
             <p style="color:#888;font-size:12px;">Keep this email itself secure — it's now a complete recovery package including your admin password and API keys.</p>`,
      attachment: { filename, base64: emailBase64 },
    });
  } else {
    console.error("BACKUP_EMAIL not set — skipping email backup");
  }

  // Second, independent copy sent to your own InterServer hosting — data
  // only, deliberately no secrets in this one.
  let interserver = null;
  if (env.INTERSERVER_BACKUP_URL && env.INTERSERVER_BACKUP_SECRET) {
    try {
      const res = await fetch(env.INTERSERVER_BACKUP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-backup-secret": env.INTERSERVER_BACKUP_SECRET,
        },
        body: dataJson,
      });
      interserver = res.ok;
      if (!res.ok) console.error("InterServer backup failed", await res.text());
    } catch (e) {
      console.error("InterServer backup request failed", e);
      interserver = false;
    }
  }

  const filename = `gst-quiz-backup-${dateStr}.json`;
  return { ok: emailed || interserver, emailed, interserver, counts, filename };
}
