// Shared by all pages; apply the saved theme before the first paint.
(() => {
  const key = "fhe-atlas-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = null;
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") preference = saved;
  } catch { /* Storage may be disabled; switching still works in this page. */ }

  function apply() {
    const theme = preference || (system.matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
      const label = theme === "dark" ? button.dataset.labelLight : button.dataset.labelDark;
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    window.dispatchEvent(new Event("atlas:themechange"));
  }

  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, preference); } catch { /* Keep the in-memory choice. */ }
      apply();
    });
  });
  system.addEventListener("change", () => { if (!preference) apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === "light" || event.newValue === "dark" ? event.newValue : null;
    apply();
  });
})();
