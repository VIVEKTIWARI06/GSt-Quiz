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
    await loadOrganizations();
    await loadBypassCode();
    await loadSimSettings();
    show("screen-admin");
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

async function loadBypassCode() {
  const data = await adminApi("/admin/bypass-code");
  $("#bypass-code-display").textContent = data.code || "No code set yet — click 'Generate new code' below.";
}

async function loadSimSettings() {
  try {
    const res = await fetch("/api/simulator-config");
    const cfg = await res.json();
    $("#sim-login-required").checked = !!cfg.login_required;
    $("#sim-free-seconds").value = cfg.free_seconds ?? 120;
  } catch {}
}

$("#btn-save-sim-settings").addEventListener("click", async () => {
  const status = $("#sim-settings-status");
  status.textContent = "Saving…";
  try {
    await adminApi("/admin/simulator-settings", {
      method: "POST",
      body: JSON.stringify({
        login_required: $("#sim-login-required").checked,
        free_seconds: Number($("#sim-free-seconds").value) || 0,
      }),
    });
    status.textContent = "Saved.";
  } catch (err) {
    status.textContent = "Error: " + err.message;
  }
});

$("#btn-regenerate-bypass").addEventListener("click", async () => {
  const status = $("#bypass-status");
  if (!window.confirm("Generate a new bypass code? The old one will stop working immediately.")) return;
  status.textContent = "Generating…";
  try {
    const data = await adminApi("/admin/bypass-code", { method: "POST" });
    $("#bypass-code-display").textContent = data.code;
    status.textContent = "New code generated and active immediately.";
  } catch (err) {
    status.textContent = "Error: " + err.message;
  }
});

async function loadOrganizations() {
  const data = await adminApi("/admin/organizations");
  const tbody = $("#orgs-tbody");
  const select = $("#course-org");
  tbody.innerHTML = "";
  select.innerHTML = '<option value="">Public — shows on the general course list</option>';

  data.organizations.forEach((o) => {
    const tr = document.createElement("tr");
    const link = `${window.location.origin}/take-test/?org=${o.id}`;
    tr.innerHTML = `
      <td><strong>${escapeHtml(o.name)}</strong><br><span class="muted small">${escapeHtml(o.id)}</span></td>
      <td>${o.course_count}</td>
      <td><a href="${link}" target="_blank" style="color: var(--gold);">${link}</a></td>`;
    tbody.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.name;
    select.appendChild(opt);
  });
}

$("#btn-create-org").addEventListener("click", async () => {
  const status = $("#org-status");
  const id = $("#org-id").value.trim();
  const name = $("#org-name").value.trim();
  if (!id || !name) {
    status.textContent = "Both fields are required.";
    return;
  }
  status.textContent = "Saving…";
  try {
    const data = await adminApi("/admin/organizations", {
      method: "POST",
      body: JSON.stringify({ id, name }),
    });
    status.textContent = `Saved. Share link: ${window.location.origin}${data.share_url}`;
    $("#org-id").value = "";
    $("#org-name").value = "";
    await loadOrganizations();
  } catch (err) {
    status.textContent = "Error: " + err.message;
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
      <td><strong>${escapeHtml(c.name)}</strong><br><span class="muted small">${escapeHtml(c.id)}${c.organization_name ? " &middot; " + escapeHtml(c.organization_name) : ""}</span></td>
      <td>${c.bank_size}</td>
      <td>${c.question_count}</td>
      <td>${c.pass_percent}%</td>
      <td>${c.attempts_completed}</td>
      <td><label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" class="course-visible-toggle" data-id="${c.id}" ${c.active ? "checked" : ""} style="width:auto;" />
        <span class="muted small">${c.active ? "Visible" : "Hidden"}</span>
      </label></td>`;
    tbody.appendChild(tr);
  });
  document.querySelectorAll(".course-visible-toggle").forEach((el) => {
    el.addEventListener("change", async () => {
      try {
        await adminApi("/admin/toggle-course", {
          method: "POST",
          body: JSON.stringify({ course_id: el.dataset.id, active: el.checked }),
        });
        await loadCourses();
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
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
    organization_id: $("#course-org").value || null,
  };

  if (!course.id || !course.name) {
    resultBox.classList.remove("hidden");
    resultBox.textContent = "Course ID and name are required.";
    return;
  }

  const replacing = $("#course-replace").checked;
  const orgLabel = course.organization_id
    ? $("#course-org").selectedOptions[0].textContent
    : "Public (general course list)";
  const confirmMsg =
    `About to import into "${course.name}" (${course.id}):\n\n` +
    `• Questions served per attempt: ${course.question_count}\n` +
    `• Time limit: ${course.time_limit_min} minutes\n` +
    `• Pass mark: ${course.pass_percent}%\n` +
    `• Visibility: ${orgLabel}\n` +
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
    const parts = [];
    parts.push(data.emailed ? "Email: sent" : "Email: failed");
    if (data.interserver !== null) {
      parts.push(data.interserver ? "InterServer: saved" : "InterServer: failed");
    }
    status.textContent = data.ok
      ? `Backup complete (${data.counts}). ${parts.join(" · ")}`
      : `Backup failed entirely. ${parts.join(" · ")}`;
  } catch (err) {
    status.textContent = "Error: " + err.message;
  }
});
