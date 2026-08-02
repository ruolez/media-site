"use strict";

async function api(path, options = {}) {
  const opts = {
    headers: { "X-CSRF": "1", ...(options.headers || {}) },
    ...options,
  };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const resp = await fetch(path, opts);
  let data = null;
  try {
    data = await resp.json();
  } catch {
    /* non-JSON response */
  }
  if (!resp.ok) {
    const err = new Error((data && data.error) || `request failed (${resp.status})`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(message, kind = "good") {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.remove("good", "err");
  el.classList.add(kind, "show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3500);
}
