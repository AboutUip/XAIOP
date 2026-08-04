(function () {
  var KEY = "xaiop-docs-theme";
  // Relative to docs/index.html — works for /docs/ (Vite) and docsify-serve root.
  var DARK = "themes/dark.css";
  var LIGHT = "themes/vue.css";

  function pref() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark" || v === "system") return v;
    } catch (e) {}
    return "system";
  }

  function resolved(p) {
    if (p === "light" || p === "dark") return p;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function apply() {
    var mode = resolved(pref());
    var link = document.getElementById("docsify-theme");
    if (link) link.href = mode === "dark" ? DARK : LIGHT;
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      var p = pref();
      btn.textContent =
        p === "system"
          ? "Theme · auto"
          : p === "dark"
            ? "Theme · dark"
            : "Theme · light";
    }
  }

  function cycle() {
    var p = pref();
    var next = p === "system" ? "light" : p === "light" ? "dark" : "system";
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    apply();
  }

  window.__xaiopDocsTheme = { apply: apply, cycle: cycle, pref: pref };
  apply();
  try {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", function () {
        if (pref() === "system") apply();
      });
  } catch (e) {}
})();
