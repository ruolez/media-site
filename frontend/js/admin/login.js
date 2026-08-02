"use strict";

fetch("/assets/logo.svg")
  .then((r) => r.text())
  .then((svg) => {
    document.querySelector("[data-logo]").innerHTML = svg;
  });

api("/api/admin/me")
  .then(() => (location.href = "/admin/projects.html"))
  .catch(() => {});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: { password: document.getElementById("pw").value },
    });
    location.href = "/admin/projects.html";
  } catch (err) {
    toast(err.message, "err");
  }
});
