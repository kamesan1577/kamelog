import * as React from "react";
import { cn } from "@/lib/utils";

export function Container({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-ds="container"
      className={cn(
        "mx-auto w-full max-w-ds-page px-ds-4 md:px-ds-6",
        className,
      )}
      {...props}
    />
  );
}
