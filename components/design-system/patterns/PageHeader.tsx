import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
}

export function PageHeader({
  className,
  title,
  description,
  ...props
}: PageHeaderProps) {
  return (
    <section
      data-ds="page-header"
      className={cn("border-b border-ds-border pb-ds-4", className)}
      {...props}
    >
      <h1 className="ds-text-lg font-semibold leading-tight text-ds-primary">
        {title}
      </h1>
      {description && (
        <p className="mt-ds-1 ds-text-sm text-ds-secondary">{description}</p>
      )}
    </section>
  );
}
