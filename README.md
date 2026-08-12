# GST Quiz Platform — gstreturn.org

A free-tier Cloudflare Pages + Functions + D1 quiz platform: lead capture → email OTP
verification → randomized MCQ quiz (30/50/100 questions, per course) → auto-scoring →
Telegram lead/result notifications → Google Sheet backup → PDF certificate emailed
and/or delivered via Telegram.

Total cost: **$0**, comfortably within free tiers for 100–300 concurrent students
(Workers free plan: 100K requests/day; D1 free plan: 5GB storage, 5M reads/100K
writes per day — see "Costs & limits" below).

---

## 0. What you need before starting

- A Cloudflare account with `gstreturn.org` already added as a zone (done ✅)
- Node.js installed locally (for `wrangler`, Cloudflare's CLI)
- A free [Resend](https://resend.com) account (for sending OTP emails + certificates)
- A Telegram account (to create your notification bot)
- A Google account (for the Sheets backup)

Install Wrangler once:
```bash
npm install -g wrangler
wrangler login
```

---

## 1. Create the D1 database

```bash
cd gst-quiz
npm install
wrangler d1 create gst-quiz-db
```

This prints a `database_id` — paste it into `wrangler.toml` in place of
`REPLACE_WITH_YOUR_D1_DATABASE_ID`.

Now create the tables:
```bash
wrangler d1 execute gst-quiz-db --file=./schema.sql --remote
```

This also seeds 3 example courses: `basic-gst` (30 Qs), `gst-returns` (50 Qs),
`advanced-gst` (100 Qs). Edit `schema.sql`'s `INSERT INTO courses` block first if
you want different names/counts — or just update them later with SQL.

## 2. Load your questions

Open `seed-questions-example.sql` — it shows the exact format. Create your own
`seed-questions.sql` with your real 100 questions (split across whichever
`course_id`s you're using), then run:

```bash
wrangler d1 execute gst-quiz-db --file=./seed-questions.sql --remote
```

**Important:** each course needs *at least* as many questions in the bank as its
`question_count`. You can load more than needed (e.g. 150 questions for a
100-question course) — the app randomly samples a fresh set per student, so not
everyone sees identical questions in identical order. This is good practice
against answer-sharing between students taking it "at the same time."

To add/edit courses later, just run more `wrangler d1 execute` commands with
plain SQL, e.g.:
```bash
wrangler d1 execute gst-quiz-db --command "INSERT INTO courses (id, name, question_count, pass_percent, time_limit_min) VALUES ('gst-audit','GST Audit Essentials',40,60,40)" --remote
```

## 3. Set up Resend (free email sending)

1. Sign up at resend.com (free tier: 100 emails/day, 3,000/month).
2. Grab an API key from the dashboard.
3. For the sandbox/free setup you can send from `onboarding@resend.dev` with no
   domain verification needed — fine for testing and low volume. To send as
   `noreply@gstreturn.org` instead, verify the domain in Resend (add a couple of
   DNS records — easy since you already manage gstreturn.org in Cloudflare) and
   set `FROM_EMAIL` accordingly.

## 4. Set up the Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → follow
   the prompts → note the **bot token** and the **bot username** (e.g.
   `GstQuizBot`).
2. Put the bot username into `public/app.js` at the top:
   `const TELEGRAM_BOT_USERNAME = "GstQuizBot";`
3. To get **your own** chat ID (so the bot can notify *you* about leads/results):
   message your new bot anything, then visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser — your chat id
   is in the JSON response under `message.chat.id`.
4. After deploying (step 7), register the webhook so the bot can hand
   certificates back to students who tap the "Get it on Telegram" button:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://gstreturn.org/api/telegram-webhook
   ```
   **Why this extra step exists:** Telegram bots can't message a user who
   hasn't messaged the bot first — that's a platform rule, not something
   Cloudflare limits. So the results page links to
   `t.me/<bot>?start=<attempt_id>`; the student taps it, Telegram opens a chat
   with your bot, and the webhook above catches that and sends the cert back
   instantly.

## 5. Set up the Google Sheet backup

Follow the instructions at the top of `apps-script/Code.gs`. You'll end up with
a Web App URL — that's your `GAS_WEBHOOK_URL`.

## 6. Environment variables

In the Cloudflare dashboard: **Workers & Pages → your project → Settings →
Environment variables** (set for the Production environment). Add these as
**secrets** (encrypted) except where noted:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | from step 3 |
| `FROM_EMAIL` | e.g. `GST Quiz <onboarding@resend.dev>` (or your verified domain address) |
| `TELEGRAM_BOT_TOKEN` | from step 4 |
| `TELEGRAM_CHAT_ID` | your own chat id, for lead/result notifications |
| `GAS_WEBHOOK_URL` | from step 5 |
| `SESSION_SECRET` | any long random string, e.g. output of `openssl rand -hex 32` |

The D1 binding (`DB`) is configured via `wrangler.toml`, not as an env var.

## 7. Deploy

```bash
wrangler pages project create gst-quiz --production-branch=main
wrangler pages deploy public --project-name=gst-quiz
```

Then in the Cloudflare dashboard: **Workers & Pages → gst-quiz → Custom
domains → Set up a custom domain** → enter `gstreturn.org` (and `www` if you
want it). Since the domain's already on Cloudflare, the DNS record gets added
automatically.

Re-deploy any time you change files with:
```bash
wrangler pages deploy public --project-name=gst-quiz
```

## 8. Test it end-to-end

1. Visit `https://gstreturn.org`, pick a course, submit your own email.
2. Confirm the OTP email arrives (check spam on first Resend sandbox sends).
3. Take the quiz, submit, confirm you see your score.
4. Confirm you got a Telegram message with the lead + result.
5. Confirm a row appeared in your Google Sheet.
6. If you passed: click "Email me the certificate" and "Get it on Telegram" —
   confirm both arrive.

---

## Costs & limits (why this stays free at 100–300 concurrent students)

- **Cloudflare Pages**: static hosting is free with no realistic traffic cap for
  a quiz app.
- **Cloudflare Pages Functions (Workers runtime)**: 100,000 requests/day free.
  A full quiz session (lead → OTP → start → ~N autosaves → submit → certificate)
  is roughly 10–110 requests depending on question count. Even 300 students
  finishing a 100-question quiz simultaneously stays under ~35,000 requests —
  comfortably inside the free daily cap.
- **D1**: 5GB storage / 5M row-reads / 100K row-writes per day, free. This app's
  read/write volume per student is small (each answer autosave is 1 write);
  300 students × 100 answers = 30,000 writes, well under the cap.
- **Resend free tier**: 100 emails/day, 3,000/month. If you expect **more than
  ~90–100 students verifying + getting certificates in a single day**, this is
  the one place you'll hit a real ceiling — upgrade Resend's paid tier (cheap,
  usage-based) or spread testing across days. Everything else here scales far
  higher than Resend's free email cap.
- **Telegram Bot API**: no meaningful limit for this volume.
- **Google Apps Script Web App**: generous free quota, not a concern here.

## Notes on academic integrity

Since students take this "at the same time," a few things in this build help
reduce trivial copying:
- Each course samples a random subset of its question bank per attempt (load
  more questions than `question_count` to make this meaningful).
- Options are always labeled A–D in DB order — if you want option order
  shuffled per-student too, that's a small addition to `quiz/start.js` (shuffle
  the four options client-side or server-side and remap `correct_option`
  accordingly); ask if you'd like this added.
- Scoring and the correct answers never reach the browser — only
  `question_text` + 4 options are sent; grading happens entirely server-side in
  `submit.js`.

## What to build next (not included yet, happy to add)

- Admin view to add/edit questions without hand-writing SQL
- Per-question option shuffling
- Resend domain verification walkthrough for a fully-branded `@gstreturn.org` sender
- Rate limiting on `/api/lead` to stop OTP-spam abuse

<!-- test deploy.bat -->
