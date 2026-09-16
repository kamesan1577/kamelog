import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-ds="badge"
      className={cn(
        "inline-flex items-center rounded-ds-pill bg-ds-hover px-2 py-1 text-ds-xs font-medium text-ds-secondary",
        className,
      )}
      {...props}
    />
  );
}
