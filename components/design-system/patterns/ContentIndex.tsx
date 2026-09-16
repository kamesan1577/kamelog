import * as React from "react";
import { cn } from "@/lib/utils";

export interface ContentIndexItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
}

export interface ContentIndexProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "onSelect"
> {
  items: ContentIndexItem[];
  onSelect: (id: string) => void;
}

export function ContentIndex({
  className,
  items,
  onSelect,
  ...props
}: ContentIndexProps) {
  return (
    <section
      data-ds="content-index"
      aria-label={props["aria-label"] ?? "コンテンツ"}
      className={cn("space-y-ds-3", className)}
      {...props}
    >
      <h2 className="ds-text-md font-semibold text-ds-primary">コンテンツ</h2>
      <div className="grid gap-ds-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="flex min-w-0 items-center gap-ds-4 rounded-ds-sm border border-ds-border bg-ds-surface p-ds-3 text-left transition-colors hover:bg-ds-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            onClick={() => onSelect(item.id)}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm bg-ds-hover text-ds-secondary">
              {item.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <strong className="ds-text-sm text-ds-primary">
                {item.title}
              </strong>
              <small className="truncate ds-text-xs text-ds-secondary">
                {item.description}
              </small>
            </span>
            <b className="ds-text-sm text-ds-secondary">{item.count}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
