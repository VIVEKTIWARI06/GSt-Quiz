// Shared across every /simulation/*.html page via a single <script> tag.
// Checks the admin-controlled gate setting; if login is required, gives a
// free trial window, then blocks further use with a login modal (reusing
// the same OTP system as the assessments — email or Telegram delivery,
// and the emergency bypass code both work here too).

(function () {
  const VERIFIED_KEY = "gst_sim_verified";
  const FIRST_VISIT_KEY = "gst_sim_first_visit";

  injectExitBar();

  if (localStorage.getItem(VERIFIED_KEY)) return; // already verified, nothing more to do

  fetch("/api/simulator-config")
    .then((r) => r.json())
    .then((cfg) => {
      if (!cfg.login_required) return; // gate is off — fully free

      let first = localStorage.getItem(FIRST_VISIT_KEY);
      if (!first) {
        first = Date.now();
        localStorage.setItem(FIRST_VISIT_KEY, first);
      }
      const elapsedSec = (Date.now() - Number(first)) / 1000;
      const remainingSec = cfg.free_seconds - elapsedSec;

      if (remainingSec <= 0) { showGate(); return; }
      showCountdown(remainingSec);
      setTimeout(showGate, remainingSec * 1000);
    })
    .catch(() => {}); // if config fetch fails, fail open (don't block on a network hiccup)

  function showCountdown(remainingSec) {
    const badge = document.createElement("div");
    badge.id = "sim-gate-countdown";
    badge.style.cssText = "position:fixed;bottom:16px;left:16px;background:#1b3a73;color:#fff;font-size:12px;font-family:Arial,Helvetica,sans-serif;padding:8px 14px;border-radius:20px;z-index:9998;box-shadow:0 2px 8px rgba(0,0,0,0.2);";
    document.body.appendChild(badge);

    let remaining = Math.ceil(remainingSec);
    function tick() {
      if (remaining <= 0) { badge.remove(); return; }
      const m = Math.floor(remaining / 60), s = remaining % 60;
      badge.textContent = `⏱ Free trial: ${m}:${String(s).padStart(2, "0")} remaining`;
      remaining--;
    }
    tick();
    const interval = setInterval(() => {
      tick();
      if (remaining < 0) clearInterval(interval);
    }, 1000);
  }

  function injectExitBar() {
    const bar = document.createElement("div");
    bar.id = "sim-exit-bar";
    bar.style.cssText = "position:fixed;top:12px;right:12px;z-index:9997;display:flex;gap:8px;font-family:Arial,Helvetica,sans-serif;";
    renderExitBar(bar);
    document.body.appendChild(bar);
  }

  function renderExitBar(bar) {
    const isVerified = !!localStorage.getItem(VERIFIED_KEY);
    bar.innerHTML = `
      <a href="/" style="background:#fff;color:#1b3a73;border:1px solid #c3c9d1;font-size:11px;font-weight:bold;padding:6px 12px;border-radius:16px;text-decoration:none;box-shadow:0 1px 4px rgba(0,0,0,0.1);">🏠 Exit to gstreturn.org</a>
      ${isVerified
        ? `<button id="sim-gate-logout" style="background:#fff;color:#b4324a;border:1px solid #c3c9d1;font-size:11px;font-weight:bold;padding:6px 12px;border-radius:16px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.1);">Logout</button>`
        : `<button id="sim-gate-login" style="background:#14b8a6;color:#fff;border:none;font-size:11px;font-weight:bold;padding:6px 12px;border-radius:16px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.1);">Login / Sign Up</button>`}
    `;
    document.getElementById("sim-gate-logout")?.addEventListener("click", () => {
      localStorage.removeItem(VERIFIED_KEY);
      localStorage.removeItem(FIRST_VISIT_KEY);
      window.location.href = "/simulation/dashboard.html";
    });
    document.getElementById("sim-gate-login")?.addEventListener("click", showGate);
  }

  function showGate() {
    if (document.getElementById("sim-gate-overlay")) return; // already showing
    document.getElementById("sim-gate-countdown")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "sim-gate-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,42,90,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Arial,Helvetica,sans-serif;";
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:6px;padding:28px;max-width:380px;width:100%;">
        <h2 style="color:#1b3a73;font-size:18px;margin-bottom:6px;">Your free trial has ended</h2>
        <p style="font-size:13px;color:#666;margin-bottom:18px;">Enter your details to keep using the GST Simulator for free — no payment, just verification.</p>
        <div id="sim-gate-step-details">
          <label style="display:block;font-size:12px;font-weight:bold;margin-bottom:4px;">Name</label>
          <input id="sim-gate-name" style="width:100%;padding:8px;border:1px solid #c3c9d1;border-radius:3px;margin-bottom:10px;" />
          <label style="display:block;font-size:12px;font-weight:bold;margin-bottom:4px;">Email</label>
          <input id="sim-gate-email" type="email" style="width:100%;padding:8px;border:1px solid #c3c9d1;border-radius:3px;margin-bottom:10px;" />
          <label style="display:block;font-size:12px;font-weight:bold;margin-bottom:4px;">Mobile</label>
          <input id="sim-gate-mobile" style="width:100%;padding:8px;border:1px solid #c3c9d1;border-radius:3px;margin-bottom:14px;" />
          <button id="sim-gate-send" style="width:100%;padding:10px;background:#1b3a73;color:#fff;border:none;border-radius:3px;font-weight:bold;cursor:pointer;">Send Verification Code</button>
          <p id="sim-gate-error" style="color:#b4324a;font-size:12px;margin-top:8px;"></p>
        </div>
        <div id="sim-gate-step-otp" style="display:none;">
          <p id="sim-gate-otp-status" style="font-size:12.5px;color:#666;margin-bottom:12px;"></p>
          <label style="display:block;font-size:12px;font-weight:bold;margin-bottom:4px;">Verification Code</label>
          <input id="sim-gate-otp" maxlength="6" style="width:100%;padding:8px;border:1px solid #c3c9d1;border-radius:3px;margin-bottom:14px;" />
          <button id="sim-gate-verify" style="width:100%;padding:10px;background:#1b3a73;color:#fff;border:none;border-radius:3px;font-weight:bold;cursor:pointer;">Verify &amp; Continue</button>
          <p id="sim-gate-otp-error" style="color:#b4324a;font-size:12px;margin-top:8px;"></p>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let savedEmail = "";

    document.getElementById("sim-gate-send").addEventListener("click", async () => {
      const name = document.getElementById("sim-gate-name").value.trim();
      const email = document.getElementById("sim-gate-email").value.trim();
      const mobile = document.getElementById("sim-gate-mobile").value.trim();
      const errEl = document.getElementById("sim-gate-error");
      errEl.textContent = "";
      if (!name || !email || !mobile) { errEl.textContent = "All fields are required."; return; }

      try {
        const res = await fetch("/api/simulator-lead", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, email, mobile }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong");
        savedEmail = email;
        document.getElementById("sim-gate-step-details").style.display = "none";
        document.getElementById("sim-gate-step-otp").style.display = "block";
        document.getElementById("sim-gate-otp-status").textContent = data.email_sent
          ? "Code sent to your email. Check Telegram too if you don't see it."
          : "Email couldn't send — check Telegram for your code, or ask for the admin bypass code.";
      } catch (e) {
        errEl.textContent = e.message;
      }
    });

    document.getElementById("sim-gate-verify").addEventListener("click", async () => {
      const code = document.getElementById("sim-gate-otp").value.trim();
      const errEl = document.getElementById("sim-gate-otp-error");
      errEl.textContent = "";
      try {
        const res = await fetch("/api/verify-otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: savedEmail, code }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid code");
        localStorage.setItem(VERIFIED_KEY, "1");
        const bar = document.getElementById("sim-exit-bar");
        if (bar) renderExitBar(bar);
        overlay.remove();
      } catch (e) {
        errEl.textContent = e.message;
      }
    });
  }
})();
