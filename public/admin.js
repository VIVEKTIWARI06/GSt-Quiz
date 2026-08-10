const $ = (sel) => document.querySelector(sel);
const show = (id) => {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
};

let adminPassword = "";

async function adminApi(path, opts = {}) {
  const headers = { "content-type": "application/json", "x-admin-password": adminPassword, ...(opts.headers || {}) };
  const res = await fetch(`/api${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

$("#btn-login").addEventListener("click", async () => {
  adminPassword = $("#admin-password").value;
  $("#login-error").textContent = "";
  try {
    await loadCourses(); // also validates the password
    show("screen-admin");
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

let knownCourses = [];

async function loadCourses() {
  const data = await adminApi("/admin/courses");
  knownCourses = data.courses;
  const tbody = $("#courses-tbody");
  tbody.innerHTML = "";
  data.courses.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.name)}</strong><br><span class="muted small">${escapeHtml(c.id)}</span></td>
      <td>${c.bank_size}</td>
      <td>${c.question_count}</td>
      <td>${c.pass_percent}%</td>
      <td>${c.attempts_completed}</td>`;
    tbody.appendChild(tr);
  });
}

$("#course-id").addEventListener("blur", () => {
  const id = $("#course-id").value.trim();
  const match = knownCourses.find((c) => c.id === id);
  if (!match) return;
  $("#course-name").value = match.name;
  $("#course-qcount").value = match.question_count;
  $("#course-pass").value = match.pass_percent;
  $("#course-time").value = match.time_limit_min;
  timeLimitManuallyEdited = true; // don't let the auto-suggest override a real saved value
});

let timeLimitManuallyEdited = false;
$("#course-time").addEventListener("input", () => { timeLimitManuallyEdited = true; });

// Suggest a sensible time limit whenever question count changes, unless
// the admin has already typed a custom value themselves.
$("#course-qcount").addEventListener("input", () => {
  if (timeLimitManuallyEdited) return;
  const n = parseInt($("#course-qcount").value, 10);
  if (!n || n <= 0) return;
  // Roughly 54 seconds per question, rounded to the nearest 5 minutes, min 15.
  const suggested = Math.max(15, Math.round((n * 0.9) / 5) * 5);
  $("#course-time").value = suggested;
});

$("#btn-import").addEventListener("click", async () => {
  const fileInput = $("#csv-file");
  const resultBox = $("#import-result");

  if (!fileInput.files.length) {
    resultBox.classList.remove("hidden");
    resultBox.textContent = "Choose a CSV file first.";
    return;
  }

  const course = {
    id: $("#course-id").value.trim(),
    name: $("#course-name").value.trim(),
    question_count: parseInt($("#course-qcount").value, 10),
    pass_percent: parseInt($("#course-pass").value, 10),
    time_limit_min: parseInt($("#course-time").value, 10),
  };

  if (!course.id || !course.name) {
    resultBox.classList.remove("hidden");
    resultBox.textContent = "Course ID and name are required.";
    return;
  }

  const replacing = $("#course-replace").checked;
  const confirmMsg =
    `About to import into "${course.name}" (${course.id}):\n\n` +
    `• Questions served per attempt: ${course.question_count}\n` +
    `• Time limit: ${course.time_limit_min} minutes\n` +
    `• Pass mark: ${course.pass_percent}%\n` +
    `• Existing questions: ${replacing ? "will be REPLACED" : "new ones will be added on top"}\n\n` +
    `Continue?`;

  if (!window.confirm(confirmMsg)) return;

  resultBox.classList.remove("hidden");
  resultBox.textContent = "Importing…";

  try {
    const csvText = await fileInput.files[0].text();
    const data = await adminApi("/admin/import-questions", {
      method: "POST",
      body: JSON.stringify({ course, csv: csvText, replace_existing: replacing }),
    });

    let msg = `Imported ${data.inserted} of ${data.rows_read} rows for "${data.course_id}".\n`;
    msg += `Question bank now has ${data.total_questions_in_bank} total questions.\n`;
    msg += `Serving ${course.question_count} per attempt, ${course.time_limit_min} min time limit.\n`;
    if (data.errors.length) {
      msg += `\n${data.skipped} row(s) skipped:\n` + data.errors.map((e) => "- " + e).join("\n");
    }
    resultBox.textContent = msg;
    await loadCourses();
  } catch (err) {
    resultBox.textContent = "Error: " + err.message;
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

$("#btn-backup").addEventListener("click", async () => {
  const status = $("#backup-status");
  status.textContent = "Running backup…";
  try {
    const data = await adminApi("/admin/backup-now", { method: "POST" });
    status.textContent = data.ok
      ? `Backup emailed successfully (${data.counts}).`
      : `Backup failed: ${data.reason || "unknown error"}`;
  } catch (err) {
    status.textContent = "Error: " + err.message;
  }
});
