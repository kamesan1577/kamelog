import { THEME_INIT_SCRIPT } from "@/lib/theme";

export function ThemeHead() {
  return (
    <>
      <meta name="color-scheme" content="light dark" />
      <meta
        name="theme-color"
        content="#f8f9f6"
        media="(prefers-color-scheme: light)"
        data-theme-color="light"
        suppressHydrationWarning
      />
      <meta
        name="theme-color"
        content="#171917"
        media="(prefers-color-scheme: dark)"
        data-theme-color="dark"
        suppressHydrationWarning
      />
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
    </>
  );
}
