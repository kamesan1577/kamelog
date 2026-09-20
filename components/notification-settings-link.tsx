"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ArrowUpRight } from "lucide-react";

// Notebook owns navigation state. A small bridge keeps notification settings
// discoverable within the owner-only account without changing public layouts.
export function NotificationSettingsLink() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const sync = () => {
      const node = document.querySelector<HTMLElement>(
        '[data-ds="owner-inference"]',
      );
      setTarget((current) => (current === node ? current : node));
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);
  return target
    ? createPortal(
        <a
          href="/settings/notifications"
          data-ds="owner-notification-link"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-[#e9e9e7] px-3 py-2 text-sm text-[#555149] hover:bg-[#f7f6f3] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Bell size={16} aria-hidden="true" /> サーバーエラーの通知設定{" "}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>,
        target,
      )
    : null;
}
