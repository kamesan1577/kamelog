"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BookOpen, Maximize2, Minimize2, Turtle, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import "./PostReader.css";

export interface PostReaderProps {
  postId: string;
  title: string;
  kind?: "blog" | "tweet" | "vlog";
  mode?: "popup" | "page";
  pageHref?: string;
  popupHref?: string;
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
  mode = "popup",
  pageHref,
  popupHref,
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
  const isPage = kind === "blog" && mode === "page";
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [progress, setProgress] = useState(0);
  const articleRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
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
      let remaining: number;
      let position: number;
      if (isPage && bodyRef.current) {
        const body = bodyRef.current.getBoundingClientRect();
        const headerHeight =
          headerRef.current?.getBoundingClientRect().height ?? 0;
        const footerHeight =
          footerRef.current?.getBoundingClientRect().height ?? 0;
        const bodyTop = body.top + window.scrollY;
        const start = Math.max(0, bodyTop - headerHeight);
        const end =
          body.bottom + window.scrollY - window.innerHeight + footerHeight;
        remaining = end - start;
        position = window.scrollY - start;
        articleRef.current?.style.setProperty(
          "--reader-header-height",
          `${headerHeight}px`,
        );
      } else {
        remaining = scrollElement.scrollHeight - scrollElement.clientHeight;
        position = scrollElement.scrollTop;
      }
      const fraction =
        remaining > 1 ? Math.min(1, Math.max(0, position / remaining)) : 1;
      progressRef.current?.style.setProperty(
        "--reader-progress",
        String(fraction),
      );
      setProgress(Math.round(fraction * 100));
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = requestAnimationFrame(updateProgress);
    };

    // A page uses native document scrolling, including the browser's restoration
    // on Back/Forward. Only the popup owns and resets an inner scroll container.
    if (!isPage) scrollElement.scrollTo({ top: 0, behavior: "instant" });
    scheduleUpdate();
    const scrollTarget = isPage ? window : scrollElement;
    scrollTarget.addEventListener("scroll", scheduleUpdate, { passive: true });
    scrollElement.addEventListener("load", scheduleUpdate, true);
    scrollElement.addEventListener("loadedmetadata", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(scrollElement);
    if (bodyRef.current) resizeObserver.observe(bodyRef.current);
    if (isPage) {
      if (headerRef.current) resizeObserver.observe(headerRef.current);
      if (footerRef.current) resizeObserver.observe(footerRef.current);
    }
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
      scrollTarget.removeEventListener("scroll", scheduleUpdate);
      scrollElement.removeEventListener("load", scheduleUpdate, true);
      scrollElement.removeEventListener("loadedmetadata", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      videos.forEach((video) => video.pause());
    };
  }, [postId, scrollElement, isPage]);

  const restoreFocus = () => {
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
  };

  const closeReader = () => {
    if (!isPage) {
      onClose();
      return;
    }
    const article = articleRef.current;
    onClose();
    requestAnimationFrame(() => {
      // The parent may veto closing or open a confirmation dialog. Restore only
      // after this page is gone and no new modal owns focus.
      if (article?.isConnected || document.querySelector('[role="dialog"]'))
        return;
      restoreFocus();
    });
  };

  const content = (
    <>
      <header ref={headerRef} data-ds="reader-header">
        <div data-ds="reader-heading">
          <BookOpen aria-hidden="true" />
          {isPage ? (
            <span data-ds="reader-title">{title}</span>
          ) : (
            <DialogTitle>{title}</DialogTitle>
          )}
        </div>
        <div data-ds="reader-header-actions">
          {kind === "blog" && (isPage ? popupHref : pageHref) && (
            <a
              data-ds="reader-presentation-link"
              href={isPage ? popupHref : pageHref}
            >
              {isPage ? (
                <Minimize2 aria-hidden="true" />
              ) : (
                <Maximize2 aria-hidden="true" />
              )}
              <span>{isPage ? "ポップアップで読む" : "ページで読む"}</span>
            </a>
          )}
          <button
            ref={closeRef}
            type="button"
            data-ds="reader-close"
            aria-label="投稿を閉じる"
            onClick={closeReader}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        ref={setScrollElement}
        data-ds="reader-scroll"
        role={isPage ? undefined : "region"}
        tabIndex={isPage ? undefined : 0}
        aria-label={isPage ? undefined : "投稿本文"}
      >
        <div ref={bodyRef} data-ds="reader-body">
          {children}
        </div>
      </div>
      <footer ref={footerRef} data-ds="reader-footer">
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
    </>
  );

  if (isPage) {
    return (
      <article
        ref={articleRef}
        data-ds="post-reader"
        data-presentation="page"
        data-kind={kind}
        aria-label={title}
      >
        {content}
      </article>
    );
  }

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
        data-presentation="popup"
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
          restoreFocus();
        }}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
