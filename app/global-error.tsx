"use client";

import { ErrorState } from "@/components/design-system/patterns/ErrorState";
import { ThemeHead } from "@/components/theme-head";
import "../styles/globals.css";
import "../styles/brand-theme.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja" data-theme="system" suppressHydrationWarning>
      <head>
        <ThemeHead />
      </head>
      <body>
        <ErrorState onRetry={reset} />
      </body>
    </html>
  );
}
