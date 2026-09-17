import * as React from "react";

export interface BlogEditorToolbarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function BlogEditorToolbar({
  className,
  children,
  ...props
}: BlogEditorToolbarProps) {
  return (
    <div data-ds="blog-editor-toolbar" className={className} {...props}>
      {children}
    </div>
  );
}
