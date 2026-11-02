export const THEME_STORAGE_KEY = "kamelog:theme";

export type ThemePreference = "system" | "light" | "dark";
export type ColorTheme = Exclude<ThemePreference, "system">;

export function themePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

// Runs in the document head before content can paint. Keep this independent of
// React and external requests; CSS handles the system default without JavaScript.
export const THEME_INIT_SCRIPT = `(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {}
  document.documentElement.dataset.theme = preference;
  for (const meta of document.querySelectorAll('meta[data-theme-color]')) {
    const theme = meta.dataset.themeColor;
    meta.media = preference === "system" ? '(prefers-color-scheme: ' + theme + ')' : preference === theme ? 'all' : 'not all';
  }
})();`;
