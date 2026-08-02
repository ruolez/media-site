"use strict";

async function render() {
  const main = document.getElementById("main");
  main.textContent = "";
  main.appendChild(el("h1", null, "Inquiries"));

  const data = await api("/api/admin/inquiries");
  if (!data.inquiries.length) {
    main.appendChild(el("p", "empty-note", "No inquiries yet."));
    return;
  }

  data.inquiries.forEach((q) => {
    const box = el("div");
    box.style.cssText = `border:1px solid var(--line);padding:1.2rem 1.4rem;margin-bottom:1rem;${
      q.is_read ? "opacity:.65" : ""
    }`;

    const head = el("div", "bar");
    head.style.marginBottom = "0.6rem";
    const who = el("div");
    const name = el("strong", null, q.name);
    const email = el("a", "mono", " " + q.email);
    email.href = `mailto:${q.email}`;
    email.style.color = "var(--accent)";
    who.append(name, email);
    if (q.company) who.appendChild(el("span", "muted", ` · ${q.company}`));

    const meta = el("div");
    meta.style.cssText = "display:flex;gap:.6rem;align-items:center";
    meta.appendChild(el("span", "mono", fmtDate(q.created_at)));
    if (!q.is_read) meta.appendChild(el("span", "pill on", "New"));
    if (q.email_error) {
      const pill = el("span", "pill err", "Email failed");
      pill.title = q.email_error;
      meta.appendChild(pill);
    }
    head.append(who, meta);

    const msg = el("p", null, q.message);
    msg.style.cssText = "white-space:pre-line;color:var(--white);font-size:.95rem";

    const actions = el("div", "actions");
    actions.style.marginTop = "0.8rem";
    if (!q.is_read) {
      const read = el("button", "btn-sm", "Mark read");
      read.addEventListener("click", async () => {
        await api(`/api/admin/inquiries/${q.id}/read`, { method: "PUT" });
        render();
      });
      actions.appendChild(read);
    }
    const del = el("button", "btn-sm danger", "Delete");
    del.addEventListener("click", async () => {
      if (!(await confirmModal("Delete inquiry", `Delete the inquiry from ${q.name}?`))) return;
      await api(`/api/admin/inquiries/${q.id}`, { method: "DELETE" });
      render();
    });
    actions.appendChild(del);

    box.append(head, msg, actions);
    main.appendChild(box);
  });
}

(async function init() {
  if (!(await requireAuth())) return;
  await buildShell("inquiries.html");
  await render();
})();
