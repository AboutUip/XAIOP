const STORAGE_KEY = "xaiop-docs-theme";

/** @returns {"light" | "dark" | "system"} */
export function readThemePreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

/** @param {"light" | "dark" | "system"} preference */
export function resolveTheme(preference) {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

/** @param {"light" | "dark"} resolved */
export function applyResolvedTheme(resolved) {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

/** @param {"light" | "dark" | "system"} preference */
export function persistThemePreference(preference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
}

/** Cycle: system → light → dark → system */
export function nextThemePreference(current) {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
