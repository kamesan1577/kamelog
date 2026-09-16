import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      data-ds="input"
      className={cn(
        "h-9 w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 text-ds-sm text-ds-primary outline-none placeholder:text-ds-tertiary focus:border-ds-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ds-accent disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
