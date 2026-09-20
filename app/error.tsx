"use client";

import { ErrorState } from "@/components/design-system/patterns/ErrorState";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
