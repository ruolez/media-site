"use strict";

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CAN_HOVER = matchMedia("(hover: hover) and (pointer: fine)").matches;

/* film grain overlay */
function initGrain() {
  if (REDUCED_MOTION) return;
  const el = document.createElement("div");
  el.className = "grain";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
}

/* 24fps timecode ticker */
function initTimecode(el) {
  if (!el) return;
  const start = performance.now();
  const pad = (n) => String(n).padStart(2, "0");
  function tick(now) {
    const totalFrames = Math.floor(((now - start) / 1000) * 24);
    const f = totalFrames % 24;
    const s = Math.floor(totalFrames / 24) % 60;
    const m = Math.floor(totalFrames / (24 * 60)) % 60;
    const h = Math.floor(totalFrames / (24 * 3600)) % 24;
    el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
    requestAnimationFrame(tick);
  }
  if (REDUCED_MOTION) {
    el.textContent = "00:00:00:00";
    return;
  }
  requestAnimationFrame(tick);
}

/* masked reveals */
function initReveals() {
  const els = document.querySelectorAll(".reveal");
  if (REDUCED_MOTION || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  els.forEach((el) => io.observe(el));
}

/* custom PLAY cursor over work cards */
function initPlayCursor() {
  if (!CAN_HOVER || REDUCED_MOTION) return;
  const pill = document.createElement("div");
  pill.className = "play-cursor";
  pill.textContent = "PLAY ●";
  pill.setAttribute("aria-hidden", "true");
  document.body.appendChild(pill);

  let x = 0, y = 0, px = 0, py = 0, active = false;

  document.addEventListener("pointermove", (e) => {
    x = e.clientX;
    y = e.clientY;
    const over = e.target.closest(".work-card, [data-play-cursor]");
    if (over && !active) {
      active = true;
      pill.classList.add("on");
    } else if (!over && active) {
      active = false;
      pill.classList.remove("on");
    }
  });

  (function loop() {
    px += (x - px) * 0.18;
    py += (y - py) * 0.18;
    pill.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  })();
}

/* hover-to-play previews with desaturate -> color bloom */
function initHoverPlay(scope = document) {
  if (!CAN_HOVER) return;
  scope.querySelectorAll("[data-preview]").forEach((card) => {
    let video = null;
    card.addEventListener("mouseenter", () => {
      if (!video) {
        video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "none";
        video.src = card.dataset.preview;
        video.className = "card-preview";
        card.querySelector(".card-media").appendChild(video);
      }
      video.play().catch(() => {});
      card.classList.add("playing");
    });
    card.addEventListener("mouseleave", () => {
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
      card.classList.remove("playing");
    });
  });
}
