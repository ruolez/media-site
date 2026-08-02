"use strict";

async function loadLogo() {
  const resp = await fetch("/assets/logo.svg");
  const svg = await resp.text();
  document.querySelectorAll("[data-logo]").forEach((el) => {
    el.innerHTML = svg;
  });
}

(async function init() {
  initGrain();
  loadLogo();

  const slug = location.pathname.split("/").filter(Boolean).pop();
  let p;
  try {
    p = await api(`/api/projects/${encodeURIComponent(slug)}`);
  } catch {
    document.getElementById("not-found").hidden = false;
    return;
  }

  document.title = `${p.title} — Vova Media`;

  document.getElementById("p-title").textContent = p.title;
  document.getElementById("p-meta").textContent = [p.client, p.category, p.year]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("p-desc").textContent = p.description || "";
  document.getElementById("p-credits").textContent = p.credits || "";

  const videoWrap = document.getElementById("project-video");
  if (p.embed_url) {
    const iframe = document.createElement("iframe");
    iframe.src = p.embed_url;
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.title = p.title;
    videoWrap.appendChild(iframe);
  } else if (p.poster) {
    const img = document.createElement("img");
    img.src = p.poster;
    img.alt = p.title;
    videoWrap.appendChild(img);
  } else {
    videoWrap.hidden = true;
  }

  const stillsWrap = document.getElementById("p-stills");
  p.stills.forEach((src) => {
    const frame = document.createElement("div");
    frame.className = "frame-239 reveal";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    frame.appendChild(img);
    stillsWrap.appendChild(frame);
  });

  const prev = document.getElementById("p-prev");
  const next = document.getElementById("p-next");
  if (p.prev_slug) {
    prev.href = `/work/${p.prev_slug}`;
    prev.hidden = false;
  }
  if (p.next_slug) {
    next.href = `/work/${p.next_slug}`;
    next.hidden = false;
  }

  document.getElementById("project").hidden = false;
  initReveals();
})();
