"use strict";

const SECTIONS = [
  {
    table: "services",
    title: "Services",
    fields: [
      ["title", "Title"],
      ["description", "Description"],
    ],
  },
  {
    table: "clients",
    title: "Clients",
    fields: [["name", "Name"]],
  },
  {
    table: "categories",
    title: "Categories",
    fields: [["name", "Name"]],
  },
];

function sectionBlock(cfg) {
  const wrap = el("section");
  wrap.appendChild(el("h2", null, cfg.title));
  const tbl = el("table", "tbl");
  const tbody = el("tbody");
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  const addRow = (item) => {
    const tr = el("tr");
    tr.draggable = true;
    tr.dataset.id = item.id;

    cfg.fields.forEach(([key, label]) => {
      const td = el("td");
      const input = Object.assign(el("input", "field"), {
        value: item[key] || "",
        placeholder: label,
      });
      input.dataset.key = key;
      td.appendChild(input);
      tr.appendChild(td);
    });

    const tdA = el("td");
    const actions = el("div", "actions");
    const save = el("button", "btn-sm", "Save");
    save.addEventListener("click", async () => {
      const body = {};
      tr.querySelectorAll("input[data-key]").forEach((i) => (body[i.dataset.key] = i.value));
      try {
        await api(`/api/admin/${cfg.table}/${item.id}`, { method: "PUT", body });
        toast("Saved");
      } catch (err) {
        toast(err.message, "err");
      }
    });
    const del = el("button", "btn-sm danger", "Delete");
    del.addEventListener("click", async () => {
      if (!(await confirmModal(`Delete ${cfg.title.toLowerCase().slice(0, -1)}`, "Are you sure?")))
        return;
      await api(`/api/admin/${cfg.table}/${item.id}`, { method: "DELETE" });
      tr.remove();
    });
    actions.append(save, del);
    tdA.appendChild(actions);
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  };

  api(`/api/admin/${cfg.table}`).then((data) => {
    data.items.forEach(addRow);
  });

  /* add-new row */
  const addWrap = el("div", "bar");
  addWrap.style.marginTop = "0.8rem";
  const inputs = cfg.fields.map(([key, label]) =>
    Object.assign(el("input", "field"), { placeholder: `New ${label.toLowerCase()}` })
  );
  const add = el("button", "btn-sm primary", "+ Add");
  add.addEventListener("click", async () => {
    const body = {};
    cfg.fields.forEach(([key], i) => (body[key] = inputs[i].value));
    try {
      const resp = await api(`/api/admin/${cfg.table}`, { method: "POST", body });
      addRow({ id: resp.id, ...body });
      inputs.forEach((i) => (i.value = ""));
    } catch (err) {
      toast(err.message, "err");
    }
  });
  const inputsWrap = el("div");
  inputsWrap.style.cssText = "display:flex;gap:.8rem;flex:1";
  inputs.forEach((i) => inputsWrap.appendChild(i));
  addWrap.append(inputsWrap, add);
  wrap.appendChild(addWrap);

  /* drag reorder */
  let dragging = null;
  tbody.addEventListener("dragstart", (e) => (dragging = e.target.closest("tr")));
  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest("tr");
    if (!over || over === dragging) return;
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    over.parentNode.insertBefore(dragging, after ? over.nextSibling : over);
  });
  tbody.addEventListener("dragend", async () => {
    const ids = [...tbody.querySelectorAll("tr")].map((tr) => Number(tr.dataset.id));
    await api(`/api/admin/${cfg.table}/reorder`, { method: "PUT", body: { ids } });
    toast("Order saved");
  });

  return wrap;
}

function blocksSection() {
  const wrap = el("section");
  const head = el("div", "bar");
  head.appendChild(el("h2", null, "Page sections (rich text + images)"));
  const add = el("a", "btn-sm primary", "+ New section");
  add.href = "section-edit.html";
  head.appendChild(add);
  wrap.appendChild(head);

  const tbl = el("table", "tbl");
  const tbody = el("tbody");
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  const empty = el("p", "empty-note", "No sections yet — they appear on the homepage after the About section.");
  wrap.appendChild(empty);

  const addRow = (b) => {
    empty.hidden = true;
    const tr = el("tr");
    tr.draggable = true;
    tr.dataset.id = b.id;

    const tdTitle = el("td");
    const link = el("a", null, b.title);
    link.href = `section-edit.html?id=${b.id}`;
    link.style.color = "var(--white)";
    tdTitle.appendChild(link);

    const tdStatus = el("td");
    tdStatus.appendChild(
      el("span", `pill ${b.published ? "on" : "off"}`, b.published ? "Published" : "Draft")
    );

    const tdA = el("td");
    const actions = el("div", "actions");
    const edit = el("a", "btn-sm", "Edit");
    edit.href = `section-edit.html?id=${b.id}`;
    const del = el("button", "btn-sm danger", "Delete");
    del.addEventListener("click", async () => {
      if (!(await confirmModal("Delete section", `Delete “${b.title}”?`))) return;
      await api(`/api/admin/blocks/${b.id}`, { method: "DELETE" });
      tr.remove();
    });
    actions.append(edit, del);
    tdA.appendChild(actions);

    tr.append(tdTitle, tdStatus, tdA);
    tbody.appendChild(tr);
  };

  api("/api/admin/blocks").then((data) => data.blocks.forEach(addRow));

  let dragging = null;
  tbody.addEventListener("dragstart", (e) => (dragging = e.target.closest("tr")));
  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest("tr");
    if (!over || over === dragging) return;
    const rect = over.getBoundingClientRect();
    over.parentNode.insertBefore(dragging, e.clientY > rect.top + rect.height / 2 ? over.nextSibling : over);
  });
  tbody.addEventListener("dragend", async () => {
    const ids = [...tbody.querySelectorAll("tr")].map((tr) => Number(tr.dataset.id));
    await api("/api/admin/blocks/reorder", { method: "PUT", body: { ids } });
    toast("Order saved");
  });

  return wrap;
}

(async function init() {
  if (!(await requireAuth())) return;
  await buildShell("content.html");
  const main = document.getElementById("main");
  main.appendChild(el("h1", null, "Site content"));
  main.appendChild(blocksSection());
  SECTIONS.forEach((cfg) => main.appendChild(sectionBlock(cfg)));
})();
