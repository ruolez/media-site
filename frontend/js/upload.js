"use strict";

/* Chunked resumable uploader — mirrors the server protocol in uploads.py:
   register (idempotent on fingerprint) -> sequential 32MB chunk PUTs
   (409 => adopt server offset) -> complete. */

const CHUNK = 32 * 1024 * 1024;
const TOKEN = location.pathname.split("/").filter(Boolean).pop();
const API = `/api/upload/${TOKEN}`;

let session = null;
let uploading = 0; // active upload count, for beforeunload warning

const $ = (id) => document.getElementById(id);

function fmtBytes(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
}

function fingerprintOf(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitOnline() {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((r) => addEventListener("online", r, { once: true }));
}

/* ---------- UI ---------- */

function fileRow(name, size) {
  const li = document.createElement("li");
  const row = document.createElement("div");
  row.className = "f-row";
  const n = document.createElement("span");
  n.className = "f-name";
  n.textContent = name;
  const st = document.createElement("span");
  st.className = "f-status";
  st.textContent = "Waiting";
  row.append(n, st);

  const bar = document.createElement("div");
  bar.className = "f-bar";
  const fill = document.createElement("div");
  fill.className = "f-fill";
  bar.appendChild(fill);

  const sub = document.createElement("div");
  sub.className = "f-sub";
  sub.textContent = fmtBytes(size);

  li.append(row, bar, sub);
  $("file-list").appendChild(li);

  return {
    status(text, cls = "") {
      st.textContent = text;
      st.className = `f-status ${cls}`;
    },
    progress(done, total) {
      fill.style.width = total ? `${(done / total) * 100}%` : "0%";
      sub.textContent = `${fmtBytes(done)} / ${fmtBytes(total)}`;
    },
  };
}

function renderQuota() {
  if (!session) return;
  $("quota").textContent =
    `Link quota: ${fmtBytes(session.bytes_used)} of ${fmtBytes(session.max_bytes)} used` +
    ` · expires ${new Date(session.expires_at).toLocaleDateString()}`;
}

function renderPendingResumes() {
  const pending = session.files.filter((f) => f.status === "uploading" && f.bytes_received > 0);
  pending.forEach((f) => {
    const ui = fileRow(f.client_name, f.total_bytes);
    ui.progress(f.bytes_received, f.total_bytes);
    ui.status("Interrupted — re-select this file to resume");
  });
}

/* ---------- protocol ---------- */

async function registerFile(file) {
  const resp = await fetch(`${API}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      fingerprint: fingerprintOf(file),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "registration failed");
  return data;
}

async function putChunk(fileId, offset, blob) {
  const resp = await fetch(`${API}/files/${fileId}/chunk?offset=${offset}`, {
    method: "PUT",
    body: blob,
  });
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 409 && typeof data.offset === "number") {
    return { offset: data.offset, resync: true };
  }
  if (!resp.ok) {
    const err = new Error(data.error || `chunk failed (${resp.status})`);
    err.fatal = resp.status === 404 || resp.status === 400 || resp.status === 413;
    throw err;
  }
  return { offset: data.offset, resync: false };
}

async function completeFile(fileId) {
  const resp = await fetch(`${API}/files/${fileId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || "finalize failed");
    err.offset = data.offset;
    throw err;
  }
  return data;
}

async function uploadFile(file) {
  const ui = fileRow(file.name, file.size);
  uploading++;
  let backoff = 1000;

  try {
    ui.status("Preparing…");
    let reg;
    while (true) {
      try {
        reg = await registerFile(file);
        break;
      } catch (e) {
        if (e.message.includes("limit")) {
          ui.status(e.message, "err");
          return;
        }
        ui.status("Connection lost — retrying…", "err");
        await waitOnline();
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    }

    if (reg.status === "complete") {
      ui.progress(file.size, file.size);
      ui.status("Complete ✓", "done");
      return;
    }

    let offset = reg.offset;
    if (offset > 0) ui.status("Resuming…");
    backoff = 1000;

    while (offset < file.size) {
      ui.progress(offset, file.size);
      ui.status(`Uploading ${Math.floor((offset / file.size) * 100)}%`);
      const blob = file.slice(offset, Math.min(offset + CHUNK, file.size));
      try {
        const res = await putChunk(reg.file_id, offset, blob);
        offset = res.offset;
        backoff = 1000;
      } catch (e) {
        if (e.fatal) {
          ui.status(e.message, "err");
          return;
        }
        ui.status("Connection lost — retrying…", "err");
        await waitOnline();
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    }

    ui.progress(file.size, file.size);
    ui.status("Verifying…");
    while (true) {
      try {
        await completeFile(reg.file_id);
        break;
      } catch (e) {
        if (typeof e.offset === "number" && e.offset < file.size) {
          // server says incomplete — resume the chunk loop from its offset
          offset = e.offset;
          ui.status("Resuming…");
          while (offset < file.size) {
            const blob = file.slice(offset, Math.min(offset + CHUNK, file.size));
            const res = await putChunk(reg.file_id, offset, blob);
            offset = res.offset;
            ui.progress(offset, file.size);
          }
          continue;
        }
        ui.status("Connection lost — retrying…", "err");
        await waitOnline();
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    }

    ui.status("Complete ✓", "done");
    session.bytes_used += file.size;
    renderQuota();
  } finally {
    uploading--;
  }
}

/* ---------- file intake ---------- */

const queue = [];
let running = false;

async function enqueue(files) {
  for (const f of files) queue.push(f);
  if (running) return;
  running = true;
  while (queue.length) {
    await uploadFile(queue.shift());
  }
  running = false;
}

function initIntake() {
  const drop = $("drop");
  const input = $("file-input");
  $("pick").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    enqueue([...input.files]);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("over");
    })
  );
  drop.addEventListener("drop", (e) => {
    enqueue([...e.dataTransfer.files]);
  });

  addEventListener("beforeunload", (e) => {
    if (uploading > 0 || queue.length > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

/* ---------- init ---------- */

(async function init() {
  fetch("/assets/logo.svg")
    .then((r) => r.text())
    .then((svg) => {
      document.querySelector("[data-logo]").innerHTML = svg;
    });

  try {
    const resp = await fetch(`${API}/session`);
    if (!resp.ok) throw new Error();
    session = await resp.json();
  } catch {
    $("card-invalid").hidden = false;
    return;
  }

  $("card-main").hidden = false;
  $("up-label").textContent = session.label;
  renderQuota();
  renderPendingResumes();
  initIntake();
})();
