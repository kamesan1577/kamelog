import * as React from "react";
import { Button } from "../primitives/Button";

export interface MobileNavigationItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}

export interface MobileNavigationProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "onSelect"
> {
  items: MobileNavigationItem[];
  onSelect?: (id: string) => void;
}

export function MobileNavigation({
  className,
  items,
  onSelect,
  ...props
}: MobileNavigationProps) {
  return (
    <nav
      data-ds="mobile-navigation"
      aria-label={props["aria-label"] ?? "モバイルナビゲーション"}
      className={className}
      {...props}
    >
      <div className="grid grid-cols-3">
        {items.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-10 w-full flex-col gap-1 rounded-none px-2 py-1 text-ds-xs"
            aria-current={item.active ? "page" : undefined}
            disabled={item.disabled}
            onClick={() => onSelect?.(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </Button>
        ))}
      </div>
    </nav>
  );
}
