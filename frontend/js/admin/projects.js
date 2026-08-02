"use strict";

const IS_EDIT = location.pathname.endsWith("project-edit.html");

async function renderList() {
  const main = document.getElementById("main");
  main.textContent = "";
  main.appendChild(el("h1", null, "Projects"));

  const bar = el("div", "bar");
  const hint = el("span", "muted", "Drag rows to reorder. Order is the order on the site.");
  const add = el("a", "btn-sm primary", "+ New project");
  add.href = "project-edit.html";
  bar.append(hint, add);
  main.appendChild(bar);

  const data = await api("/api/admin/projects");
  if (!data.projects.length) {
    main.appendChild(el("p", "empty-note", "No projects yet — create your first one."));
    return;
  }

  const tbl = el("table", "tbl");
  const thead = el("thead");
  const hrow = el("tr");
  ["", "Title", "Client", "Category", "Year", "Status", ""].forEach((h) =>
    hrow.appendChild(el("th", null, h))
  );
  thead.appendChild(hrow);
  const tbody = el("tbody");

  data.projects.forEach((p) => {
    const tr = el("tr");
    tr.draggable = true;
    tr.dataset.id = p.id;

    const tdThumb = el("td");
    if (p.poster_path) {
      const img = el("img", "thumb");
      img.src = `/media/${p.poster_path}`;
      img.alt = "";
      tdThumb.appendChild(img);
    } else {
      tdThumb.appendChild(el("div", "thumb"));
    }

    const tdTitle = el("td");
    const link = el("a", null, p.title);
    link.href = `project-edit.html?id=${p.id}`;
    link.style.color = "var(--white)";
    tdTitle.appendChild(link);

    const tdStatus = el("td");
    tdStatus.appendChild(
      el("span", `pill ${p.published ? "on" : "off"}`, p.published ? "Published" : "Draft")
    );

    const tdActions = el("td");
    const actions = el("div", "actions");
    const edit = el("a", "btn-sm", "Edit");
    edit.href = `project-edit.html?id=${p.id}`;
    const del = el("button", "btn-sm danger", "Delete");
    del.addEventListener("click", async () => {
      if (!(await confirmModal("Delete project", `Delete “${p.title}” and all its media?`))) return;
      await api(`/api/admin/projects/${p.id}`, { method: "DELETE" });
      renderList();
    });
    actions.append(edit, del);
    tdActions.appendChild(actions);

    tr.append(
      tdThumb,
      tdTitle,
      el("td", "muted", p.client || "—"),
      el("td", "muted", p.category || "—"),
      el("td", "muted", p.year ?? "—"),
      tdStatus,
      tdActions
    );
    tbody.appendChild(tr);
  });

  tbl.append(thead, tbody);
  main.appendChild(tbl);
  initDragReorder(tbody, "/api/admin/projects/reorder");
}

function initDragReorder(tbody, endpoint) {
  let dragging = null;
  tbody.addEventListener("dragstart", (e) => {
    dragging = e.target.closest("tr");
    e.dataTransfer.effectAllowed = "move";
  });
  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest("tr");
    if (!over || over === dragging) return;
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    over.parentNode.insertBefore(dragging, after ? over.nextSibling : over);
  });
  tbody.addEventListener("drop", (e) => e.preventDefault());
  tbody.addEventListener("dragend", async () => {
    const ids = [...tbody.querySelectorAll("tr")].map((tr) => Number(tr.dataset.id));
    await api(endpoint, { method: "PUT", body: { ids } });
    toast("Order saved");
  });
}

/* ---------- edit form ---------- */

async function renderEdit() {
  const main = document.getElementById("main");
  const id = new URLSearchParams(location.search).get("id");
  const isNew = !id;

  const [categories, project] = await Promise.all([
    api("/api/admin/categories").then((d) => d.items),
    isNew ? null : api(`/api/admin/projects/${id}`),
  ]);

  main.textContent = "";
  main.appendChild(el("h1", null, isNew ? "New project" : `Edit — ${project.title}`));

  const form = el("form", "form-grid");
  form.noValidate = true;

  const addField = (labelText, input, full = false) => {
    const wrap = el("div", full ? "full" : null);
    const label = el("label", "lbl", labelText);
    wrap.append(label, input);
    form.appendChild(wrap);
    return input;
  };

  const title = addField("Title *", Object.assign(el("input", "field"), { value: project?.title || "" }));
  const client = addField("Client", Object.assign(el("input", "field"), { value: project?.client || "" }));

  const category = el("select", "field");
  category.appendChild(new Option("— none —", ""));
  categories.forEach((c) =>
    category.appendChild(new Option(c.name, c.id, false, project?.category_id === c.id))
  );
  addField("Category", category);

  const year = addField(
    "Year",
    Object.assign(el("input", "field"), { type: "number", value: project?.year ?? "" })
  );
  const video = addField(
    "Video URL (YouTube or Vimeo)",
    Object.assign(el("input", "field"), {
      value: project?.video_url || "",
      placeholder: "https://youtu.be/… or https://vimeo.com/…",
    }),
    true
  );
  const desc = addField(
    "Description",
    Object.assign(el("textarea", "field"), { value: project?.description || "" }),
    true
  );
  const credits = addField(
    "Credits (one per line, e.g. DIRECTOR — Name)",
    Object.assign(el("textarea", "field"), { value: project?.credits || "" }),
    true
  );

  const pubWrap = el("label", "check full");
  const pub = Object.assign(el("input"), { type: "checkbox", checked: !!project?.published });
  pubWrap.append(pub, document.createTextNode(" Published (visible on the site)"));
  form.appendChild(pubWrap);

  const actions = el("div", "form-actions full");
  const save = el("button", "btn btn-solid", isNew ? "Create project" : "Save changes");
  save.type = "submit";
  const back = el("a", "btn", "Back to list");
  back.href = "projects.html";
  actions.append(save, back);
  form.appendChild(actions);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: title.value,
      client: client.value,
      category_id: category.value || null,
      year: year.value || null,
      video_url: video.value,
      description: desc.value,
      credits: credits.value,
      published: pub.checked,
    };
    try {
      if (isNew) {
        const resp = await api("/api/admin/projects", { method: "POST", body });
        location.href = `project-edit.html?id=${resp.id}`;
      } else {
        await api(`/api/admin/projects/${id}`, { method: "PUT", body });
        toast("Saved");
      }
    } catch (err) {
      toast(err.message, "err");
    }
  });

  main.appendChild(form);

  if (!isNew) {
    renderMediaSection(main, project);
  } else {
    main.appendChild(
      el("p", "muted", "Save the project first, then add a poster, hover preview and stills.")
    );
  }
}

function renderMediaSection(main, project) {
  const id = project.id;

  /* poster */
  main.appendChild(el("h2", null, "Poster image (JPEG/PNG/WebP, ≤20MB)"));
  const posterSlot = el("div", "media-slot");
  const renderPoster = (path) => {
    posterSlot.textContent = "";
    if (path) {
      const img = el("img");
      img.src = path.startsWith("/media/") ? path : `/media/${path}`;
      posterSlot.appendChild(img);
    }
    posterSlot.appendChild(
      uploadButton(path ? "Replace poster" : "Upload poster", "image/*", false, async (files) => {
        const resp = await uploadMedia(`/api/admin/media/projects/${id}/poster`, files[0]);
        renderPoster(resp.path);
        toast("Poster uploaded");
      })
    );
  };
  renderPoster(project.poster_path);
  main.appendChild(posterSlot);

  /* preview */
  main.appendChild(el("h2", null, "Hover preview clip (MP4, short & muted, ≤200MB)"));
  const prevSlot = el("div", "media-slot");
  const renderPreview = (path) => {
    prevSlot.textContent = "";
    if (path) {
      const v = el("video");
      v.src = path.startsWith("/media/") ? path : `/media/${path}`;
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      prevSlot.appendChild(v);
      const rm = el("button", "btn-sm danger", "Remove");
      rm.addEventListener("click", async () => {
        await api(`/api/admin/media/projects/${id}/preview`, { method: "DELETE" });
        renderPreview(null);
      });
      prevSlot.appendChild(rm);
    }
    prevSlot.appendChild(
      uploadButton(path ? "Replace clip" : "Upload clip", "video/mp4", false, async (files) => {
        const resp = await uploadMedia(`/api/admin/media/projects/${id}/preview`, files[0]);
        renderPreview(resp.path);
        toast("Preview uploaded");
      })
    );
  };
  renderPreview(project.preview_path);
  main.appendChild(prevSlot);

  /* stills */
  main.appendChild(el("h2", null, "Stills (JPEG/PNG/WebP, ≤20MB each)"));
  const stillsWrap = el("div", "stills-grid");
  const addStill = (still) => {
    const cell = el("div", "still");
    const img = el("img");
    img.src = still.path.startsWith("/media/") ? still.path : `/media/${still.path}`;
    const rm = el("button", "btn-sm danger", "✕");
    rm.addEventListener("click", async () => {
      await api(`/api/admin/media/stills/${still.id}`, { method: "DELETE" });
      cell.remove();
    });
    cell.append(img, rm);
    stillsWrap.appendChild(cell);
  };
  project.stills.forEach(addStill);
  main.appendChild(stillsWrap);
  const stillsSlot = el("div", "media-slot");
  stillsSlot.style.marginTop = "0.8rem";
  stillsSlot.appendChild(
    uploadButton("Add stills", "image/*", true, async (files) => {
      const fd = new FormData();
      [...files].forEach((f) => fd.append("file", f));
      const resp = await api(`/api/admin/media/projects/${id}/stills`, {
        method: "POST",
        body: fd,
      });
      resp.stills.forEach(addStill);
      toast("Stills uploaded");
    })
  );
  main.appendChild(stillsSlot);
}

function uploadButton(label, accept, multiple, onFiles) {
  const wrap = el("span");
  const input = Object.assign(el("input"), { type: "file", accept, multiple, hidden: true });
  const btn = el("button", "btn-sm primary", label);
  btn.type = "button";
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    if (!input.files.length) return;
    btn.disabled = true;
    btn.textContent = "Uploading…";
    try {
      await onFiles(input.files);
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      input.value = "";
    }
  });
  wrap.append(btn, input);
  return wrap;
}

async function uploadMedia(url, file) {
  const fd = new FormData();
  fd.append("file", file);
  return api(url, { method: "POST", body: fd });
}

(async function init() {
  if (!(await requireAuth())) return;
  await buildShell("projects.html");
  try {
    if (IS_EDIT) await renderEdit();
    else await renderList();
  } catch (err) {
    toast(err.message, "err");
  }
})();
