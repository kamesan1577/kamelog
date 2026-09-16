import * as React from "react";
import { cn } from "@/lib/utils";

export function Stack({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-ds="stack"
      className={cn("flex flex-col gap-ds-4", className)}
      {...props}
    />
  );
}
