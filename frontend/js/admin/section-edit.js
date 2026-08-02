"use strict";

const TOOLBAR = [
  ["bold", "B", "Bold"],
  ["italic", "I", "Italic"],
  ["underline", "U", "Underline"],
  ["|"],
  ["h2", "H2", "Heading"],
  ["h3", "H3", "Subheading"],
  ["p", "¶", "Paragraph"],
  ["|"],
  ["ul", "• List", "Bullet list"],
  ["ol", "1. List", "Numbered list"],
  ["quote", "❝ Quote", "Quote"],
  ["hr", "— Rule", "Horizontal rule"],
  ["|"],
  ["link", "Link", "Insert link"],
  ["unlink", "Unlink", "Remove link"],
  ["image", "Image", "Insert image"],
  ["|"],
  ["clear", "Clear", "Clear formatting"],
  ["html", "HTML", "Edit raw HTML"],
];

function buildEditor(initialHtml) {
  const wrap = el("div", "editor");
  const bar = el("div", "editor-bar");
  const area = el("div", "rich editor-area");
  area.contentEditable = "true";
  area.innerHTML = initialHtml || "<p></p>";
  const source = el("textarea", "field editor-source");
  source.hidden = true;
  source.spellcheck = false;

  const imgInput = Object.assign(el("input"), {
    type: "file",
    accept: "image/*",
    hidden: true,
  });

  let htmlMode = false;

  const exec = (cmd, val = null) => {
    area.focus();
    document.execCommand(cmd, false, val);
  };

  const actions = {
    bold: () => exec("bold"),
    italic: () => exec("italic"),
    underline: () => exec("underline"),
    h2: () => exec("formatBlock", "<h2>"),
    h3: () => exec("formatBlock", "<h3>"),
    p: () => exec("formatBlock", "<p>"),
    ul: () => exec("insertUnorderedList"),
    ol: () => exec("insertOrderedList"),
    quote: () => exec("formatBlock", "<blockquote>"),
    hr: () => exec("insertHorizontalRule"),
    link: () => {
      const url = prompt("Link URL (https://… or /work/…):");
      if (url) exec("createLink", url);
    },
    unlink: () => exec("unlink"),
    image: () => imgInput.click(),
    clear: () => {
      exec("removeFormat");
      exec("formatBlock", "<p>");
    },
    html: () => {
      htmlMode = !htmlMode;
      if (htmlMode) {
        source.value = area.innerHTML;
        area.hidden = true;
        source.hidden = false;
      } else {
        area.innerHTML = source.value;
        source.hidden = true;
        area.hidden = false;
      }
      bar.querySelectorAll("button").forEach((b) => {
        if (b.dataset.cmd !== "html") b.disabled = htmlMode;
      });
    },
  };

  TOOLBAR.forEach(([cmd, label, title]) => {
    if (cmd === "|") {
      bar.appendChild(el("span", "editor-sep"));
      return;
    }
    const btn = el("button", "btn-sm", label);
    btn.type = "button";
    btn.title = title;
    btn.dataset.cmd = cmd;
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
    btn.addEventListener("click", () => actions[cmd]());
    bar.appendChild(btn);
  });

  imgInput.addEventListener("change", async () => {
    if (!imgInput.files.length) return;
    const fd = new FormData();
    fd.append("file", imgInput.files[0]);
    try {
      toast("Uploading image…");
      const resp = await api("/api/admin/media/content-image", { method: "POST", body: fd });
      exec("insertImage", resp.path);
      toast("Image inserted");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      imgInput.value = "";
    }
  });

  wrap.append(bar, area, source, imgInput);
  return {
    root: wrap,
    getHtml: () => (htmlMode ? source.value : area.innerHTML),
    setHtml: (html) => {
      area.innerHTML = html;
      if (htmlMode) source.value = html;
    },
  };
}

(async function init() {
  if (!(await requireAuth())) return;
  await buildShell("content.html");
  const main = document.getElementById("main");

  const id = new URLSearchParams(location.search).get("id");
  const isNew = !id;
  const block = isNew ? null : await api(`/api/admin/blocks/${id}`);

  main.appendChild(el("h1", null, isNew ? "New section" : `Section — ${block.title}`));

  const form = el("form");
  form.noValidate = true;

  form.appendChild(el("label", "lbl", "Section title *"));
  const title = Object.assign(el("input", "field"), { value: block?.title || "" });
  form.appendChild(title);

  const showWrap = el("label", "check");
  const showTitle = Object.assign(el("input"), {
    type: "checkbox",
    checked: block ? !!block.show_title : true,
  });
  showWrap.append(
    showTitle,
    document.createTextNode(" Show title as a numbered section heading on the site")
  );
  form.appendChild(showWrap);

  form.appendChild(el("label", "lbl", "Content"));
  const editor = buildEditor(block?.body_html || "");
  form.appendChild(editor.root);
  form.appendChild(
    el("p", "muted", "Allowed content: headings, paragraphs, bold/italic, lists, quotes, links, rules and uploaded images. Anything else is stripped on save.")
  );

  const pubWrap = el("label", "check");
  const pub = Object.assign(el("input"), { type: "checkbox", checked: !!block?.published });
  pubWrap.append(pub, document.createTextNode(" Published (visible on the homepage)"));
  form.appendChild(pubWrap);

  const actions = el("div", "form-actions");
  const save = el("button", "btn btn-solid", isNew ? "Create section" : "Save changes");
  save.type = "submit";
  const back = el("a", "btn", "Back to content");
  back.href = "content.html";
  const view = el("a", "btn", "View site ↗");
  view.href = "/";
  view.target = "_blank";
  actions.append(save, back, view);
  form.appendChild(actions);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: title.value,
      show_title: showTitle.checked,
      body_html: editor.getHtml(),
      published: pub.checked,
    };
    try {
      if (isNew) {
        const resp = await api("/api/admin/blocks", { method: "POST", body });
        location.href = `section-edit.html?id=${resp.id}`;
      } else {
        const resp = await api(`/api/admin/blocks/${id}`, { method: "PUT", body });
        // reflect what the server kept after sanitizing
        if (typeof resp.body_html === "string") editor.setHtml(resp.body_html);
        toast("Saved");
      }
    } catch (err) {
      toast(err.message, "err");
    }
  });

  main.appendChild(form);
})();
