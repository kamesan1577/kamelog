import * as React from "react";
import { cn } from "@/lib/utils";

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  sidebar: React.ReactNode;
  header?: React.ReactNode;
  mobileNavigation?: React.ReactNode;
}

/**
 * The shared coordinate system for public and owner-facing pages.
 * Feature navigation stays in the slot; shell geometry stays here.
 */
export function AppShell({
  className,
  sidebar,
  header,
  mobileNavigation,
  children,
  ...props
}: AppShellProps) {
  return (
    <div
      data-ds="app-shell"
      className={cn(
        "grid min-h-screen bg-ds-page text-ds-primary md:ds-shell-grid",
        className,
      )}
      {...props}
    >
      <aside
        aria-label="サイドナビゲーション"
        className="hidden border-r border-ds-border bg-ds-page md:flex md:flex-col"
      >
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-col">
        {header && (
          <header className="border-b border-ds-border bg-ds-page">
            {header}
          </header>
        )}
        <main className="min-w-0 flex-1">{children}</main>
        {mobileNavigation && (
          <nav
            aria-label="モバイルナビゲーション"
            className="border-t border-ds-border bg-ds-surface md:hidden"
          >
            {mobileNavigation}
          </nav>
        )}
      </div>
    </div>
  );
}
