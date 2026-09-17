"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import styles from "./federation-timeline-link.module.css";

function timelineHeading(): HTMLElement | null {
  const heading = document.querySelector<HTMLElement>(
    '.notebook [data-ds="page-header"]',
  );
  return heading?.querySelector("h1")?.textContent?.trim() === "タイムライン"
    ? heading
    : null;
}

// The timeline heading lives in Notebook. Keep the guide link adjacent to its
// heading without making the public guide depend on owner-only mode controls.
export function FederationTimelineLink() {
  const [heading, setHeading] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = timelineHeading();
      setHeading((current) => (current === next ? current : next));
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  return heading
    ? createPortal(
        <p className={styles.note}>
          ActivityPubに対応しています。{" "}
          <Link className={styles.link} href="/federation">
            対応範囲を見る
          </Link>
        </p>,
        heading,
      )
    : null;
}
