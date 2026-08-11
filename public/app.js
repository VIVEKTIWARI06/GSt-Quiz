// ============================================================
// GST Quiz — frontend app logic. No build step, no framework.
// Talks to the same-origin API under /api/* (Cloudflare Pages Functions).
// ============================================================

const TELEGRAM_BOT_USERNAME = "YourGstQuizBot"; // <-- set this after creating your bot

const state = {
  courses: [],
  selectedCourse: null,
  email: "",
  token: null,
  attemptId: null,
  questions: [],
  answers: {},        // question_id -> 'A'|'B'|'C'|'D'
  currentIndex: 0,
  timerInterval: null,
  timeLeftSec: 0,
};

const $ = (sel) => document.querySelector(sel);
const show = (id) => {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
};

async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// ---------- Screen: course selection ----------
async function loadCourses() {
  try {
    const data = await api("/courses");
    state.courses = data.courses;
    const list = $("#course-list");
    list.innerHTML = "";
    data.courses.forEach((c) => {
      const el = document.createElement("div");
      el.className = "course-item";
      el.innerHTML = `
        <div>
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="meta">${c.question_count} questions &middot; ${c.time_limit_min} min &middot; pass at ${c.pass_percent}%</div>
        </div>
        <span class="arrow">&rarr;</span>`;
      el.addEventListener("click", () => {
        state.selectedCourse = c;
        show("screen-lead");
      });
      list.appendChild(el);
    });

    // If linked from the landing page with ?course=some-id, skip straight
    // to the signup form for that course instead of making them pick again.
    const preselect = new URLSearchParams(window.location.search).get("course");
    if (preselect) {
      const match = data.courses.find((c) => c.id === preselect);
      if (match) {
        state.selectedCourse = match;
        show("screen-lead");
      }
    }
  } catch (e) {
    $("#course-list").innerHTML = `<p class="error">Couldn't load courses: ${escapeHtml(e.message)}</p>`;
  }
}

// ---------- Screen: lead capture ----------
$("#lead-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#lead-name").value.trim();
  const email = $("#lead-email").value.trim();
  const mobile = $("#lead-mobile").value.trim();
  $("#lead-error").textContent = "";
  try {
    await api("/lead", {
      method: "POST",
      body: JSON.stringify({ name, email, mobile, course_id: state.selectedCourse.id }),
    });
    state.email = email;
    show("screen-otp");
  } catch (err) {
    $("#lead-error").textContent = err.message;
  }
});

// ---------- Screen: OTP verify ----------
$("#otp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#otp-code").value.trim();
  $("#otp-error").textContent = "";
  try {
    const data = await api("/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: state.email, code }),
    });
    state.token = data.token;
    await startQuiz();
  } catch (err) {
    $("#otp-error").textContent = err.message;
  }
});

// ---------- Screen: quiz ----------
async function startQuiz() {
  const data = await api("/quiz/start", {
    method: "POST",
    body: JSON.stringify({ course_id: state.selectedCourse.id }),
  });
  state.attemptId = data.attempt_id;
  state.questions = data.questions;
  state.answers = {};
  state.currentIndex = 0;
  state.timeLeftSec = data.course.time_limit_min * 60;

  show("screen-quiz");
  renderQuestion();
  startTimer();
}

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  $("#quiz-progress").textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  $("#progress-fill").style.width = `${((state.currentIndex) / state.questions.length) * 100}%`;
  $("#quiz-question").textContent = q.question_text;

  const opts = [
    ["A", q.option_a], ["B", q.option_b], ["C", q.option_c], ["D", q.option_d],
  ];
  const container = $("#quiz-options");
  container.innerHTML = "";
  opts.forEach(([letter, text]) => {
    const el = document.createElement("div");
    el.className = "quiz-option" + (state.answers[q.id] === letter ? " selected" : "");
    el.innerHTML = `<span class="opt-letter">${letter}</span><span>${escapeHtml(text)}</span>`;
    el.addEventListener("click", () => selectAnswer(q.id, letter));
    container.appendChild(el);
  });

  $("#quiz-prev").disabled = state.currentIndex === 0;
  const isLast = state.currentIndex === state.questions.length - 1;
  $("#quiz-next").classList.toggle("hidden", isLast);
  $("#quiz-submit").classList.toggle("hidden", !isLast);
}

function selectAnswer(questionId, letter) {
  state.answers[questionId] = letter;
  renderQuestion();
  // autosave, fire-and-forget
  api("/answer", {
    method: "POST",
    body: JSON.stringify({ attempt_id: state.attemptId, question_id: questionId, selected_option: letter }),
  }).catch(() => {});
}

$("#quiz-prev").addEventListener("click", () => {
  if (state.currentIndex > 0) { state.currentIndex--; renderQuestion(); }
});
$("#quiz-next").addEventListener("click", () => {
  if (state.currentIndex < state.questions.length - 1) { state.currentIndex++; renderQuestion(); }
});
$("#quiz-submit").addEventListener("click", submitQuiz);

function startTimer() {
  clearInterval(state.timerInterval);
  updateTimerLabel();
  state.timerInterval = setInterval(() => {
    state.timeLeftSec--;
    updateTimerLabel();
    if (state.timeLeftSec <= 0) {
      clearInterval(state.timerInterval);
      submitQuiz();
    }
  }, 1000);
}
function updateTimerLabel() {
  const m = Math.max(0, Math.floor(state.timeLeftSec / 60));
  const s = Math.max(0, state.timeLeftSec % 60);
  $("#quiz-timer").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function submitQuiz() {
  clearInterval(state.timerInterval);
  try {
    const data = await api("/submit", {
      method: "POST",
      body: JSON.stringify({ attempt_id: state.attemptId }),
    });
    showResult(data);
  } catch (err) {
    alert("Couldn't submit quiz: " + err.message);
  }
}

// ---------- Screen: result ----------
function showResult(data) {
  show("screen-result");
  const badge = $("#result-badge");
  badge.className = "result-badge " + (data.passed ? "pass" : "fail");
  badge.textContent = data.passed ? "✓" : "✕";
  $("#result-heading").textContent = data.passed ? "You passed!" : "Not quite there";
  $("#result-detail").textContent =
    `${data.student_name}, you scored ${data.score}/${data.total} (${data.percent}%) on ${data.course_name}.`;

  if (data.passed) {
    $("#cert-actions").classList.remove("hidden");
    $("#btn-telegram-cert").href = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${state.attemptId}`;
  } else {
    $("#cert-actions").classList.add("hidden");
  }
}

$("#btn-email-cert").addEventListener("click", async () => {
  $("#cert-status").textContent = "Sending…";
  try {
    await api("/certificate", { method: "POST", body: JSON.stringify({ attempt_id: state.attemptId }) });
    $("#cert-status").textContent = "Sent! Check your inbox.";
  } catch (err) {
    $("#cert-status").textContent = "Error: " + err.message;
  }
});

$("#btn-restart").addEventListener("click", () => {
  clearInterval(state.timerInterval);
  Object.assign(state, {
    selectedCourse: null, email: "", token: null, attemptId: null,
    questions: [], answers: {}, currentIndex: 0, timeLeftSec: 0,
  });
  $("#lead-form").reset();
  $("#otp-form").reset();
  show("screen-course");
});

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => show(btn.dataset.back));
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

loadCourses();
