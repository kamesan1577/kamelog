import * as React from "react";
import { Button } from "../primitives/Button";

export interface SideNavigationItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  active?: boolean;
  disabled?: boolean;
}

export interface SideNavigationProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "onSelect"
> {
  items: SideNavigationItem[];
  onSelect?: (id: string) => void;
}

export function SideNavigation({
  className,
  items,
  onSelect,
  ...props
}: SideNavigationProps) {
  return (
    <nav
      data-ds="side-navigation"
      aria-label={props["aria-label"] ?? "サイドナビゲーション"}
      className={className}
      {...props}
    >
      <div className="flex flex-col gap-px">
        {items.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={item.active ? "primary" : "ghost"}
            size="sm"
            className="justify-start"
            aria-current={item.active ? "page" : undefined}
            disabled={item.disabled}
            onClick={() => onSelect?.(item.id)}
          >
            {item.icon}
            <span className="min-w-0 flex-1 truncate text-left">
              {item.label}
            </span>
            {item.count != null && (
              <span className="ds-text-xs text-ds-tertiary">{item.count}</span>
            )}
          </Button>
        ))}
      </div>
    </nav>
  );
}
