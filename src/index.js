// Worker entry point (the "new unified Workers" model Cloudflare now uses).
// This is a thin router: it reuses the exact same handler functions that
// live under /functions/api/*.js (originally written for Pages Functions —
// their onRequestGet/onRequestPost signature is compatible, so nothing in
// those files needed to change), and falls back to serving static files
// from /public for everything else via the ASSETS binding.

import { onRequestGet as coursesGet } from "../functions/api/courses.js";
import { onRequestPost as leadPost } from "../functions/api/lead.js";
import { onRequestPost as verifyOtpPost } from "../functions/api/verify-otp.js";
import { onRequestPost as quizStartPost } from "../functions/api/quiz/start.js";
import { onRequestPost as answerPost } from "../functions/api/answer.js";
import { onRequestPost as submitPost } from "../functions/api/submit.js";
import { onRequestPost as certificatePost } from "../functions/api/certificate.js";
import { onRequestPost as telegramWebhookPost } from "../functions/api/telegram-webhook.js";
import { onRequestGet as adminCoursesGet } from "../functions/api/admin/courses.js";
import { onRequestPost as adminImportPost } from "../functions/api/admin/import-questions.js";
import { onRequestPost as adminBackupPost } from "../functions/api/admin/backup-now.js";
import { onRequestPost as quizResumePost } from "../functions/api/quiz/resume.js";
import { onRequestGet as organizationsGet } from "../functions/api/organizations.js";
import { onRequestGet as adminOrgsGet, onRequestPost as adminOrgsPost } from "../functions/api/admin/organizations.js";
import { onRequestGet as bypassCodeGet, onRequestPost as bypassCodePost } from "../functions/api/admin/bypass-code.js";
import { onRequestPost as simulatorLeadPost } from "../functions/api/simulator-lead.js";
import { onRequestGet as simulatorConfigGet } from "../functions/api/simulator-config.js";
import { onRequestPost as simulatorSettingsPost } from "../functions/api/admin/simulator-settings.js";
import { onRequestPost as toggleCoursePost } from "../functions/api/admin/toggle-course.js";
import { runBackup } from "../functions/_backup.js";

const routes = {
  "GET /api/courses": coursesGet,
  "POST /api/lead": leadPost,
  "POST /api/verify-otp": verifyOtpPost,
  "POST /api/quiz/start": quizStartPost,
  "POST /api/quiz/resume": quizResumePost,
  "POST /api/answer": answerPost,
  "POST /api/submit": submitPost,
  "POST /api/certificate": certificatePost,
  "POST /api/telegram-webhook": telegramWebhookPost,
  "GET /api/organizations": organizationsGet,
  "GET /api/admin/courses": adminCoursesGet,
  "POST /api/admin/import-questions": adminImportPost,
  "POST /api/admin/backup-now": adminBackupPost,
  "GET /api/admin/organizations": adminOrgsGet,
  "POST /api/admin/organizations": adminOrgsPost,
  "GET /api/admin/bypass-code": bypassCodeGet,
  "POST /api/admin/bypass-code": bypassCodePost,
  "POST /api/simulator-lead": simulatorLeadPost,
  "GET /api/simulator-config": simulatorConfigGet,
  "POST /api/admin/simulator-settings": simulatorSettingsPost,
  "POST /api/admin/toggle-course": toggleCoursePost,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const routeKey = `${request.method} ${url.pathname}`;
    const handler = routes[routeKey];

    if (handler) {
      try {
        return await handler({ request, env, ctx });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message || "Server error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // Not an API route — serve the static frontend from /public.
    return env.ASSETS.fetch(request);
  },

  // Runs automatically every Sunday (see wrangler.toml [triggers] crons)
  // and emails a full JSON backup of every table to BACKUP_EMAIL.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBackup(env));
  },
};
