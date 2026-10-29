"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BookOpen, Turtle, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import "./PostReader.css";

export interface PostReaderProps {
  postId: string;
  title: string;
  kind?: "blog" | "tweet" | "vlog";
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  returnFocusSelector?: string;
}

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function PostReader({
  postId,
  title,
  kind = "blog",
  onClose,
  children,
  actions,
  returnFocusSelector,
}: PostReaderProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [progress, setProgress] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!scrollElement) return;
    let frame: number | null = null;
    const videos = new Set(scrollElement.querySelectorAll("video"));
    const rememberVideos = () => {
      scrollElement
        .querySelectorAll("video")
        .forEach((video) => videos.add(video));
    };
    const updateProgress = () => {
      frame = null;
      const remaining = scrollElement.scrollHeight - scrollElement.clientHeight;
      const fraction =
        remaining > 1
          ? Math.min(1, Math.max(0, scrollElement.scrollTop / remaining))
          : 1;
      progressRef.current?.style.setProperty(
        "--reader-progress",
        String(fraction),
      );
      setProgress(Math.round(fraction * 100));
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = requestAnimationFrame(updateProgress);
    };

    scrollElement.scrollTo({ top: 0, behavior: "instant" });
    scheduleUpdate();
    scrollElement.addEventListener("scroll", scheduleUpdate, { passive: true });
    scrollElement.addEventListener("load", scheduleUpdate, true);
    scrollElement.addEventListener("loadedmetadata", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(scrollElement);
    if (bodyRef.current) resizeObserver.observe(bodyRef.current);
    const mutationObserver = new MutationObserver(() => {
      rememberVideos();
      scheduleUpdate();
    });
    mutationObserver.observe(scrollElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scrollElement.removeEventListener("scroll", scheduleUpdate);
      scrollElement.removeEventListener("load", scheduleUpdate, true);
      scrollElement.removeEventListener("loadedmetadata", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      videos.forEach((video) => video.pause());
    };
  }, [postId, scrollElement]);

  // Portals have no server-rendered content. Keep direct links readable until
  // hydration, including when JavaScript is unavailable.
  if (!hydrated) {
    return (
      <section
        data-ds="post-reader-fallback"
        data-kind={kind}
        aria-label={title}
      >
        {children}
        {actions && <div data-ds="reader-actions">{actions}</div>}
      </section>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-ds="post-reader"
        data-kind={kind}
        overlayDataDs="reader-overlay"
        showCloseButton={false}
        aria-modal="true"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLElement)
            returnFocusRef.current = activeElement;
          closeRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const returnTarget =
            returnFocusRef.current?.isConnected &&
            returnFocusRef.current !== document.body
              ? returnFocusRef.current
              : returnFocusSelector
                ? document.querySelector<HTMLElement>(returnFocusSelector)
                : null;
          if (returnTarget) {
            returnTarget.focus({ preventScroll: true });
          } else {
            const navigationTargets = document.querySelectorAll<HTMLElement>(
              'nav [aria-current="page"], nav button, nav a[href]',
            );
            const visibleTargets = Array.from(navigationTargets).filter(
              (target) =>
                target.getClientRects().length > 0 &&
                !target.hasAttribute("disabled"),
            );
            const target =
              visibleTargets.find(
                (element) => element.getAttribute("aria-current") === "page",
              ) ?? visibleTargets[0];
            target?.focus({ preventScroll: true });
          }
        }}
      >
        <header data-ds="reader-header">
          <div data-ds="reader-heading">
            <BookOpen aria-hidden="true" />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <button
            ref={closeRef}
            type="button"
            data-ds="reader-close"
            aria-label="投稿を閉じる"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div
          ref={setScrollElement}
          data-ds="reader-scroll"
          role="region"
          tabIndex={0}
          aria-label="投稿本文"
        >
          <div ref={bodyRef} data-ds="reader-body">
            {children}
          </div>
        </div>
        <footer data-ds="reader-footer">
          {actions && <div data-ds="reader-actions">{actions}</div>}
          <div
            ref={progressRef}
            data-ds="reading-progress"
            role="progressbar"
            aria-label="読書進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span>読書進捗</span>
            <div data-ds="reader-track" aria-hidden="true">
              <div data-ds="reader-progress-fill" />
              <Turtle data-ds="reader-turtle" />
            </div>
            <span data-ds="reader-percent" aria-hidden="true">
              {progress}%
            </span>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
