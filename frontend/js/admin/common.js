"use strict";

const NAV_ITEMS = [
  ["projects.html", "Projects"],
  ["content.html", "Content"],
  ["inquiries.html", "Inquiries"],
  ["upload-links.html", "Uploads"],
  ["settings.html", "Settings"],
];

async function requireAuth() {
  try {
    await api("/api/admin/me");
    return true;
  } catch {
    location.href = "/admin/";
    return false;
  }
}

async function buildShell(active) {
  const side = document.querySelector(".side");
  if (!side) return;

  const logo = document.createElement("a");
  logo.className = "side-logo";
  logo.href = "/admin/projects.html";
  const mark = document.createElement("span");
  mark.className = "nav-mark";
  fetch("/assets/logo.svg").then((r) => r.text()).then((svg) => {
    mark.innerHTML = svg;
  });
  const word = document.createElement("span");
  word.textContent = "Vova Media";
  logo.append(mark, word);

  const nav = document.createElement("nav");
  NAV_ITEMS.forEach(([href, label]) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (href === active) a.classList.add("active");
    if (href === "inquiries.html") a.id = "nav-inquiries";
    nav.appendChild(a);
  });

  const bottom = document.createElement("div");
  bottom.className = "side-bottom";
  const view = document.createElement("a");
  view.href = "/";
  view.target = "_blank";
  view.textContent = "View site ↗";
  const out = document.createElement("button");
  out.textContent = "Log out";
  out.addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST" });
    location.href = "/admin/";
  });
  bottom.append(view, out);

  side.append(logo, nav, bottom);

  try {
    const data = await api("/api/admin/inquiries?unread=1");
    if (data.unread > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = data.unread;
      document.getElementById("nav-inquiries").appendChild(badge);
    }
  } catch {
    /* non-fatal */
  }
}

function confirmModal(title, text) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "admin-modal";
    const box = document.createElement("div");
    box.className = "box";
    const h = document.createElement("h3");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = text;
    const row = document.createElement("div");
    row.className = "row";
    const cancel = document.createElement("button");
    cancel.className = "btn-sm";
    cancel.textContent = "Cancel";
    const ok = document.createElement("button");
    ok.className = "btn-sm danger";
    ok.textContent = "Confirm";
    row.append(cancel, ok);
    box.append(h, p, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const done = (v) => {
      overlay.remove();
      resolve(v);
    };
    cancel.addEventListener("click", () => done(false));
    ok.addEventListener("click", () => done(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(false);
    });
  });
}

function fmtBytes(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString();
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
