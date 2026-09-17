import * as React from "react";

export interface PostActionsProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PostActions({
  className,
  children,
  ...props
}: PostActionsProps) {
  return (
    <div data-ds="post-actions" className={className} {...props}>
      {children}
    </div>
  );
}
