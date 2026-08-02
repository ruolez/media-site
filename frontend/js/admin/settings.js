"use strict";

const SITE_FIELDS = [
  ["site_title", "Site title"],
  ["tagline", "Tagline"],
  ["meta_description", "Meta description (SEO)"],
  ["showreel_url", "Showreel URL (YouTube/Vimeo)"],
  ["contact_email", "Contact email (inquiries are sent here)"],
  ["social_instagram", "Instagram URL"],
  ["social_youtube", "YouTube URL"],
  ["social_vimeo", "Vimeo URL"],
];

const SMTP_FIELDS = [
  ["smtp_host", "SMTP host"],
  ["smtp_port", "SMTP port"],
  ["smtp_user", "SMTP username"],
  ["smtp_password", "SMTP password"],
  ["smtp_from", "From address"],
];

function fieldRow(key, label, value, type = "text") {
  const wrap = el("div");
  wrap.appendChild(el("label", "lbl", label));
  const input = Object.assign(el("input", "field"), { value: value ?? "", type });
  input.dataset.key = key;
  wrap.appendChild(input);
  return wrap;
}

async function render() {
  const main = document.getElementById("main");
  const settings = await api("/api/admin/settings");
  main.textContent = "";
  main.appendChild(el("h1", null, "Settings"));

  const form = el("form", "form-grid");
  form.noValidate = true;

  /* site settings */
  const siteHead = el("h2", "full", "Site");
  form.appendChild(siteHead);
  SITE_FIELDS.forEach(([key, label]) => form.appendChild(fieldRow(key, label, settings[key])));

  const manifestoWrap = el("div", "full");
  manifestoWrap.appendChild(el("label", "lbl", "Manifesto (About section — line breaks kept)"));
  const manifesto = Object.assign(el("textarea", "field"), { value: settings.manifesto ?? "" });
  manifesto.dataset.key = "manifesto";
  manifestoWrap.appendChild(manifesto);
  form.appendChild(manifestoWrap);

  /* smtp */
  form.appendChild(el("h2", "full", "SMTP (outgoing email)"));
  SMTP_FIELDS.forEach(([key, label]) =>
    form.appendChild(fieldRow(key, label, settings[key], key === "smtp_password" ? "password" : "text"))
  );
  const tlsWrap = el("label", "check");
  const tls = Object.assign(el("input"), {
    type: "checkbox",
    checked: settings.smtp_tls !== "false",
  });
  tlsWrap.append(tls, document.createTextNode(" Use STARTTLS (use port 465 for implicit SSL)"));
  form.appendChild(tlsWrap);

  const actions = el("div", "form-actions full");
  const save = el("button", "btn btn-solid", "Save settings");
  save.type = "submit";
  const test = el("button", "btn", "Send test email");
  test.type = "button";
  test.addEventListener("click", async () => {
    test.disabled = true;
    test.textContent = "Sending…";
    try {
      const resp = await api("/api/admin/settings/test-smtp", { method: "POST", body: {} });
      toast(`Test sent to ${resp.sent_to}`);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      test.disabled = false;
      test.textContent = "Send test email";
    }
  });
  actions.append(save, test);
  form.appendChild(actions);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { smtp_tls: tls.checked ? "true" : "false" };
    form.querySelectorAll("[data-key]").forEach((i) => (body[i.dataset.key] = i.value));
    try {
      await api("/api/admin/settings", { method: "PUT", body });
      toast("Settings saved");
    } catch (err) {
      toast(err.message, "err");
    }
  });

  main.appendChild(form);

  /* hero loop */
  main.appendChild(el("h2", null, "Hero background loop (MP4, short & muted, ≤200MB)"));
  const heroSlot = el("div", "media-slot");
  const renderHero = (path) => {
    heroSlot.textContent = "";
    if (path) {
      const v = el("video");
      v.src = path.startsWith("/media/") ? path : `/media/${path}`;
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      heroSlot.appendChild(v);
      const rm = el("button", "btn-sm danger", "Remove");
      rm.addEventListener("click", async () => {
        await api("/api/admin/media/hero-loop", { method: "DELETE" });
        renderHero("");
      });
      heroSlot.appendChild(rm);
    }
    const input = Object.assign(el("input"), { type: "file", accept: "video/mp4", hidden: true });
    const btn = el("button", "btn-sm primary", path ? "Replace loop" : "Upload loop");
    btn.type = "button";
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      if (!input.files.length) return;
      btn.disabled = true;
      btn.textContent = "Uploading…";
      const fd = new FormData();
      fd.append("file", input.files[0]);
      try {
        const resp = await api("/api/admin/media/hero-loop", { method: "POST", body: fd });
        renderHero(resp.path);
        toast("Hero loop uploaded");
      } catch (err) {
        toast(err.message, "err");
        btn.disabled = false;
        btn.textContent = path ? "Replace loop" : "Upload loop";
      }
    });
    heroSlot.append(btn, input);
  };
  renderHero(settings.hero_loop_path);
  main.appendChild(heroSlot);

  /* password */
  main.appendChild(el("h2", null, "Change admin password"));
  const pwForm = el("form", "form-grid");
  const cur = Object.assign(el("input", "field"), { type: "password", autocomplete: "current-password" });
  const nw = Object.assign(el("input", "field"), { type: "password", autocomplete: "new-password" });
  const curW = el("div");
  curW.append(el("label", "lbl", "Current password"), cur);
  const nwW = el("div");
  nwW.append(el("label", "lbl", "New password (min 8 chars)"), nw);
  const pwActions = el("div", "form-actions full");
  const pwBtn = el("button", "btn", "Change password");
  pwBtn.type = "submit";
  pwActions.appendChild(pwBtn);
  pwForm.append(curW, nwW, pwActions);
  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/password", {
        method: "PUT",
        body: { current: cur.value, new: nw.value },
      });
      cur.value = nw.value = "";
      toast("Password changed");
    } catch (err) {
      toast(err.message, "err");
    }
  });
  main.appendChild(pwForm);
}

(async function init() {
  if (!(await requireAuth())) return;
  await buildShell("settings.html");
  await render();
})();
