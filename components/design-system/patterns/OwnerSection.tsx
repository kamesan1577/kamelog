import * as React from "react";

export interface OwnerSectionProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function OwnerSection({
  title,
  description,
  icon,
  children,
  className,
  ...props
}: OwnerSectionProps) {
  return (
    <section className={className} {...props}>
      <header>
        {icon}
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}
