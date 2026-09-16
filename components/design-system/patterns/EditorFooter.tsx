import * as React from "react";

export interface EditorFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  characterCount: number;
  closeAction: React.ReactNode;
  submitAction: React.ReactNode;
  countClassName?: string;
}

export function EditorFooter({
  className,
  characterCount,
  closeAction,
  submitAction,
  countClassName,
  ...props
}: EditorFooterProps) {
  return (
    <div data-ds="editor-footer" className={className} {...props}>
      <span className={countClassName}>{characterCount}文字</span>
      {closeAction}
      {submitAction}
    </div>
  );
}
