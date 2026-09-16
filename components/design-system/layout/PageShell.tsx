import * as React from "react";
import { cn } from "@/lib/utils";
import { Container } from "./Container";

export function PageShell({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      data-ds="page-shell"
      className={cn(
        "min-h-screen bg-ds-page py-ds-6 text-ds-primary",
        className,
      )}
      {...props}
    >
      <Container>{children}</Container>
    </main>
  );
}
