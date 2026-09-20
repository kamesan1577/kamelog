"use client";

import { ErrorState } from "@/components/design-system/patterns/ErrorState";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <ErrorState onRetry={reset} />
      </body>
    </html>
  );
}
