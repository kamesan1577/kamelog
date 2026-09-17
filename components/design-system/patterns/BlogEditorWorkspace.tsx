import * as React from "react";

export type BlogEditorWorkspaceMode = "edit" | "preview" | "split";

export interface BlogEditorWorkspaceProps
  extends React.HTMLAttributes<HTMLDivElement> {
  mode: BlogEditorWorkspaceMode;
  editor: React.ReactNode;
  preview: React.ReactNode;
}

export function BlogEditorWorkspace({
  className,
  mode,
  editor,
  preview,
  ...props
}: BlogEditorWorkspaceProps) {
  return (
    <div
      data-ds="blog-editor-workspace"
      data-ds-mode={mode}
      className={className}
      {...props}
    >
      {mode !== "preview" && editor}
      {mode !== "edit" && preview}
    </div>
  );
}
