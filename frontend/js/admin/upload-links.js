"use strict";

async function render() {
  const main = document.getElementById("main");
  main.textContent = "";
  main.appendChild(el("h1", null, "Upload links"));

  /* create form */
  const form = el("form", "bar");
  const label = Object.assign(el("input", "field"), {
    placeholder: "Label (e.g. ACME raw footage)",
    required: true,
  });
  label.style.flex = "2";
  const days = Object.assign(el("input", "field"), {
    type: "number", value: 14, min: 1, title: "Expiry (days)",
  });
  days.style.width = "6rem";
  const gb = Object.assign(el("input", "field"), {
    type: "number", value: 200, min: 1, title: "Max total size (GB)",
  });
  gb.style.width = "6rem";
  const create = el("button", "btn-sm primary", "Create link");
  create.type = "submit";
  form.append(label, wrapLbl(days, "days"), wrapLbl(gb, "GB"), create);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const resp = await api("/api/admin/upload-links", {
        method: "POST",
        body: { label: label.value, expiry_days: days.value, max_gb: gb.value },
      });
      showLinkModal(resp.url);
      label.value = "";
      renderTable();
    } catch (err) {
      toast(err.message, "err");
    }
  });
  main.appendChild(form);

  const tableWrap = el("div");
  main.appendChild(tableWrap);

  async function renderTable() {
    const data = await api("/api/admin/upload-links");
    tableWrap.textContent = "";
    if (!data.links.length) {
      tableWrap.appendChild(el("p", "empty-note", "No upload links yet."));
      return;
    }

    const tbl = el("table", "tbl");
    const hrow = el("tr");
    ["Label", "Status", "Files", "Used", "Expires", ""].forEach((h) =>
      hrow.appendChild(el("th", null, h))
    );
    tbl.appendChild(el("thead")).appendChild(hrow);
    const tbody = el("tbody");

    data.links.forEach((l) => {
      const tr = el("tr");
      const pill = el(
        "span",
        `pill ${l.status === "active" ? "on" : l.status === "revoked" ? "err" : "off"}`,
        l.status
      );
      const tdStatus = el("td");
      tdStatus.appendChild(pill);

      const tdActions = el("td");
      const actions = el("div", "actions");
      const files = el("button", "btn-sm", `Files (${l.file_count})`);
      files.addEventListener("click", () => toggleFiles(tr, l));
      actions.appendChild(files);
      if (l.status === "active") {
        const revoke = el("button", "btn-sm", "Revoke");
        revoke.addEventListener("click", async () => {
          if (!(await confirmModal("Revoke link", `Revoke “${l.label}”? The customer's URL stops working immediately.`))) return;
          await api(`/api/admin/upload-links/${l.id}/revoke`, { method: "POST" });
          renderTable();
        });
        actions.appendChild(revoke);
      }
      const del = el("button", "btn-sm danger", "Delete");
      del.addEventListener("click", async () => {
        if (!(await confirmModal("Delete link", `Delete “${l.label}” AND all files uploaded through it?`))) return;
        await api(`/api/admin/upload-links/${l.id}`, { method: "DELETE" });
        renderTable();
      });
      actions.appendChild(del);
      tdActions.appendChild(actions);

      tr.append(
        el("td", null, l.label),
        tdStatus,
        el("td", "muted", String(l.file_count)),
        el("td", "muted", fmtBytes(l.bytes_used)),
        el("td", "muted", new Date(l.expires_at).toLocaleDateString()),
        tdActions
      );
      tbody.appendChild(tr);
    });

    tbl.appendChild(tbody);
    tableWrap.appendChild(tbl);
  }

  async function toggleFiles(tr, link) {
    const existing = tr.nextElementSibling;
    if (existing && existing.classList.contains("files-row")) {
      existing.remove();
      return;
    }
    const data = await api(`/api/admin/upload-links/${link.id}/files`);
    const row = el("tr", "files-row");
    const td = el("td");
    td.colSpan = 6;
    if (!data.files.length) {
      td.appendChild(el("p", "empty-note", "Nothing uploaded yet."));
    } else {
      const inner = el("table", "tbl");
      const ib = el("tbody");
      data.files.forEach((f) => {
        const r = el("tr");
        const status =
          f.status === "complete"
            ? el("span", "pill on", "Complete")
            : el("span", "pill off", `${Math.floor((f.bytes_received / f.total_bytes) * 100) || 0}%`);
        const tdS = el("td");
        tdS.appendChild(status);

        const tdA = el("td");
        const actions = el("div", "actions");
        if (f.status === "complete") {
          const dl = el("a", "btn-sm primary", "Download");
          dl.href = `/api/admin/upload-files/${f.id}/download`;
          actions.appendChild(dl);
        }
        const del = el("button", "btn-sm danger", "Delete");
        del.addEventListener("click", async () => {
          if (!(await confirmModal("Delete file", `Delete “${f.client_name}” from the server?`))) return;
          await api(`/api/admin/upload-files/${f.id}`, { method: "DELETE" });
          r.remove();
        });
        actions.appendChild(del);
        tdA.appendChild(actions);

        r.append(
          el("td", null, f.client_name),
          el("td", "muted", fmtBytes(f.total_bytes)),
          tdS,
          el("td", "muted", f.completed_at ? fmtDate(f.completed_at) : fmtDate(f.created_at)),
          tdA
        );
        ib.appendChild(r);
      });
      inner.appendChild(ib);
      td.appendChild(inner);
    }
    row.appendChild(td);
    tr.after(row);
  }

  renderTable();
}

function wrapLbl(input, suffix) {
  const w = el("span");
  w.style.cssText = "display:flex;align-items:center;gap:.4rem";
  w.append(input, el("span", "mono", suffix));
  return w;
}

function showLinkModal(url) {
  const overlay = el("div", "admin-modal");
  const box = el("div", "box");
  box.appendChild(el("h3", null, "Upload link created"));
  box.appendChild(
    el("p", null, "Copy it now — for security the full link is shown only once. Send it to your customer.")
  );
  const urlBox = el("div", "token-url", url);
  box.appendChild(urlBox);
  const row = el("div", "row");
  row.style.marginTop = "1.2rem";
  const copy = el("button", "btn-sm primary", "Copy link");
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(url);
    copy.textContent = "Copied ✓";
  });
  const close = el("button", "btn-sm", "Close");
  close.addEventListener("click", () => overlay.remove());
  row.append(copy, close);
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

(async function init() {
  if (!(await requireAuth())) return;
  await buildShell("upload-links.html");
  await render();
})();
