import * as React from "react";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  message,
  action,
  children,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div data-ds="empty-state" className={className} {...props}>
      {message ? <p>{message}</p> : children}
      {action}
    </div>
  );
}
