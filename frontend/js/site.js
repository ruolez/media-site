"use strict";

let SITE = null;
let showreelEmbed = "";

async function loadLogo() {
  const resp = await fetch("/assets/logo.svg");
  const svg = await resp.text();
  document.querySelectorAll("[data-logo]").forEach((el) => {
    el.innerHTML = svg;
  });
}

function renderSite(site) {
  SITE = site;
  document.getElementById("hero-tagline").textContent = site.tagline || "";

  if (site.hero_loop) {
    const v = document.createElement("video");
    v.muted = true;
    v.autoplay = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = site.hero_loop;
    if (!REDUCED_MOTION) {
      document.getElementById("hero-media").appendChild(v);
      v.play().catch(() => {});
    }
  }

  showreelEmbed = site.showreel_embed || "";
  const reelBtn = document.getElementById("btn-reel");
  if (showreelEmbed) reelBtn.hidden = false;

  const list = document.getElementById("services-list");
  list.textContent = "";
  site.services.forEach((s) => {
    const li = document.createElement("li");
    const title = document.createElement("span");
    title.className = "svc-title";
    title.textContent = s.title;
    const desc = document.createElement("span");
    desc.className = "svc-desc";
    desc.textContent = s.description;
    li.append(title, desc);
    list.appendChild(li);
  });
  document.getElementById("services").hidden = site.services.length === 0;

  const manifesto = document.getElementById("manifesto");
  manifesto.textContent = site.manifesto || "";
  document.getElementById("about").hidden = !site.manifesto;

  if (site.clients.length) {
    const track = document.getElementById("marquee-track");
    track.textContent = "";
    const names = [...site.clients, ...site.clients]; // duplicated for seamless loop
    names.forEach((name) => {
      const span = document.createElement("span");
      span.textContent = name;
      track.appendChild(span);
    });
    document.getElementById("clients-section").hidden = false;
  }

  const socials = document.getElementById("socials");
  socials.textContent = "";
  const links = [
    ["Instagram", site.social.instagram],
    ["YouTube", site.social.youtube],
    ["Vimeo", site.social.vimeo],
  ];
  links.forEach(([label, url]) => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label + " ↗";
    socials.appendChild(a);
  });

  renderBlocks(site.blocks || []);
  renderFilters(site.categories);
  renumberSections();
}

function renderBlocks(blocks) {
  const wrap = document.getElementById("blocks");
  wrap.textContent = "";
  blocks.forEach((b) => {
    const section = document.createElement("section");
    section.className = "section block-section";

    if (b.show_title) {
      const head = document.createElement("div");
      head.className = "section-head reveal";
      const num = document.createElement("span");
      num.className = "mono section-num";
      const h2 = document.createElement("h2");
      h2.className = "display";
      // last word set in serif italic, matching the built-in section headings
      const words = b.title.trim().split(/\s+/);
      const last = words.pop();
      h2.textContent = words.length ? words.join(" ") + " " : "";
      const em = document.createElement("em");
      em.className = "serif-accent";
      em.textContent = last;
      h2.appendChild(em);
      head.append(num, h2);
      section.appendChild(head);
    }

    const body = document.createElement("div");
    body.className = "rich reveal";
    // body_html is sanitized server-side against a strict allowlist
    body.innerHTML = b.body_html;
    section.appendChild(body);
    wrap.appendChild(section);
  });
}

function renumberSections() {
  let n = 0;
  document.querySelectorAll("section:not([hidden]) .section-num").forEach((el) => {
    n += 1;
    el.textContent = String(n).padStart(2, "0");
  });
}

function renderFilters(categories) {
  const wrap = document.getElementById("filters");
  wrap.textContent = "";
  if (categories.length < 2) return;

  const mk = (label, slug) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.slug = slug;
    b.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      loadProjects(slug);
    });
    return b;
  };
  const all = mk("All", "");
  all.classList.add("active");
  wrap.appendChild(all);
  categories.forEach((c) => wrap.appendChild(mk(c.name, c.slug)));
}

async function loadProjects(category = "") {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  const data = await api(`/api/projects${qs}`);
  const grid = document.getElementById("work-grid");
  grid.textContent = "";
  document.getElementById("work-empty").hidden = data.projects.length > 0;

  data.projects.forEach((p) => {
    const card = document.createElement("a");
    card.className = "work-card reveal";
    card.href = `/work/${p.slug}`;
    if (p.preview) card.dataset.preview = p.preview;

    const media = document.createElement("div");
    media.className = "card-media";
    if (p.poster) {
      const img = document.createElement("img");
      img.src = p.poster;
      img.alt = p.title;
      img.loading = "lazy";
      media.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "card-noposter";
      ph.textContent = "VM";
      media.appendChild(ph);
    }

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = p.title;
    const sub = document.createElement("span");
    sub.className = "card-sub mono";
    sub.textContent = [p.client, p.category, p.year].filter(Boolean).join(" · ");
    meta.append(title, sub);

    card.append(media, meta);
    grid.appendChild(card);
  });

  initHoverPlay(grid);
  initReveals();
}

function initReelModal() {
  const modal = document.getElementById("reel-modal");
  const frame = document.getElementById("reel-frame");

  document.getElementById("btn-reel").addEventListener("click", () => {
    frame.textContent = "";
    const iframe = document.createElement("iframe");
    iframe.src = showreelEmbed + (showreelEmbed.includes("?") ? "&" : "?") + "autoplay=1";
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  });

  const close = () => {
    modal.hidden = true;
    frame.textContent = ""; // stops playback
    document.body.style.overflow = "";
  };
  document.getElementById("reel-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });
}

function initContactForm() {
  const form = document.getElementById("contact-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector(".submit-btn");
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      await api("/api/contact", {
        method: "POST",
        body: {
          name: form.name.value,
          email: form.email.value,
          company: form.company.value,
          message: form.message.value,
          website: form.website.value,
        },
      });
      form.reset();
      toast("Thanks — we'll get back to you soon.");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send inquiry";
    }
  });
}

(async function init() {
  document.getElementById("year").textContent = new Date().getFullYear();
  initGrain();
  initTimecode(document.getElementById("timecode"));
  initPlayCursor();
  initReelModal();
  initContactForm();

  loadLogo();
  try {
    const site = await api("/api/site");
    renderSite(site);
    if (site.meta_description) {
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", site.meta_description);
    }
  } catch {
    /* static shell still renders */
  }
  await loadProjects();
  initReveals();
})();
