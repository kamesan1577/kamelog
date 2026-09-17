import * as React from "react";

export interface InlineComposerProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onDrop"
> {
  avatar: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onDrop?: React.DragEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  maxLength?: number;
  bodyClassName?: string;
  startClassName?: string;
  submit: React.ReactNode;
  media?: React.ReactNode;
  toolbar?: React.ReactNode;
}

export function InlineComposer({
  className,
  avatar,
  value,
  onValueChange,
  onSubmit,
  onDrop,
  placeholder,
  maxLength,
  bodyClassName,
  startClassName,
  submit,
  media,
  toolbar,
  ...props
}: InlineComposerProps) {
  return (
    <div data-ds="inline-composer" className={className} {...props}>
      <div className={startClassName}>
        {avatar}
        <textarea
          className={bodyClassName}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={1}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        />
        {submit}
      </div>
      {media}
      {toolbar}
    </div>
  );
}
