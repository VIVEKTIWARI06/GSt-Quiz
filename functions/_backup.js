import { sendEmail } from "./_utils.js";

// Pulls every table into one JSON object and emails it as a downloadable
// attachment. Used both by the weekly Cron Trigger and the admin "Backup now" button.
export async function runBackup(env) {
  const tables = ["courses", "questions", "students", "attempts", "answers"];
  const backup = { generated_at: new Date().toISOString() };

  for (const t of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${t}`).all();
    backup[t] = results;
  }

  const json = JSON.stringify(backup, null, 2);
  const base64 = btoa(unescape(encodeURIComponent(json))); // handle UTF-8 safely
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `gst-quiz-backup-${dateStr}.json`;

  if (!env.BACKUP_EMAIL) {
    console.error("BACKUP_EMAIL not set — skipping backup email");
    return { ok: false, reason: "BACKUP_EMAIL not configured" };
  }

  const counts = tables.map((t) => `${t}: ${backup[t].length}`).join(", ");

  const emailed = await sendEmail(env, {
    to: env.BACKUP_EMAIL,
    subject: `GST Quiz backup — ${dateStr}`,
    html: `<p>Weekly backup attached.</p><p>Row counts — ${counts}</p>`,
    attachment: { filename, base64 },
  });

  return { ok: emailed, counts, filename };
}
