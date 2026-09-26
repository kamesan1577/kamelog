import { useRef, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import type { TimelineFilter } from "./design-system/patterns/TimelineToolbar";

type Mode = "kamelog" | "fediverse";
type GestureStart = {
  x: number;
  y: number;
  atTop: boolean;
  canSwipe: boolean;
  canPull: boolean;
};
const filters: TimelineFilter[] = ["all", "blog", "tweet", "vlog"];

function scrollingSurface(): HTMLElement | null {
  const candidates = [
    document.querySelector<HTMLElement>('[data-ds="site-layout"]'),
    document.querySelector<HTMLElement>('[data-ds="workspace"]'),
  ];
  for (const surface of candidates) {
    if (
      surface &&
      surface.scrollHeight > surface.clientHeight + 1 &&
      /auto|scroll/.test(getComputedStyle(surface).overflowY)
    ) {
      return surface;
    }
  }
  return document.scrollingElement as HTMLElement | null;
}

export function scrollTimelineToTop() {
  const surface = scrollingSurface();
  const behavior: ScrollBehavior = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches
    ? "auto"
    : "smooth";
  if (surface === document.scrollingElement || !surface) {
    window.scrollTo({ top: 0, behavior });
  } else {
    surface.scrollTo({ top: 0, behavior });
  }
}

function unsafeSwipeTarget(target: Element) {
  if (
    target.closest(
      'a, input, textarea, select, video, [contenteditable="true"], [role="dialog"], .image-grid, .fediverse-attachments, .composer, [data-ds="timeline-toolbar"]',
    ) ||
    (target.closest("button") && !target.closest(".post-focus"))
  ) {
    return true;
  }
  for (
    let element: Element | null = target;
    element;
    element = element.parentElement
  ) {
    if (!(element instanceof HTMLElement)) continue;
    if (
      element.scrollWidth > element.clientWidth + 4 &&
      /auto|scroll/.test(getComputedStyle(element).overflowX)
    ) {
      return true;
    }
  }
  return false;
}

export function useTimelineGestures({
  active,
  mode,
  filter,
  onFilterChange,
  onRefresh,
  refreshing,
}: {
  active: boolean;
  mode: Mode;
  filter: TimelineFilter;
  onFilterChange: (value: TimelineFilter) => void;
  onRefresh: () => Promise<boolean>;
  refreshing: boolean;
}) {
  const start = useRef<GestureStart | null>(null);
  const suppressClickUntil = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);

  const onTouchStartCapture = (event: TouchEvent<HTMLElement>) => {
    start.current = null;
    if (
      !active ||
      refreshing ||
      event.touches.length !== 1 ||
      !window.matchMedia("(max-width: 640px) and (pointer: coarse)").matches
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element) || unsafeSwipeTarget(target)) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const touch = event.touches[0];
    const atTop = (scrollingSurface()?.scrollTop ?? window.scrollY) <= 1;
    start.current = {
      x: touch.clientX,
      y: touch.clientY,
      atTop,
      canSwipe:
        mode === "kamelog" &&
        Boolean(target.closest(".feed")) &&
        touch.clientX >= 32 &&
        touch.clientX <= window.innerWidth - 32,
      canPull: atTop,
    };
  };
  const onTouchMoveCapture = (event: TouchEvent<HTMLElement>) => {
    const origin = start.current;
    if (!origin || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - origin.x;
    const dy = event.touches[0].clientY - origin.y;
    if (origin.canPull && dy > 0 && dy > Math.abs(dx) * 1.5) {
      setPullDistance(Math.min(88, Math.round(dy / 2)));
    } else {
      setPullDistance(0);
    }
  };
  const onTouchEndCapture = (event: TouchEvent<HTMLElement>) => {
    const origin = start.current;
    start.current = null;
    setPullDistance(0);
    if (!origin || event.changedTouches.length !== 1 || !active || refreshing)
      return;
    const dx = event.changedTouches[0].clientX - origin.x;
    const dy = event.changedTouches[0].clientY - origin.y;
    if (
      origin.canPull &&
      dy >= 88 &&
      dy > Math.abs(dx) * 1.5 &&
      (scrollingSurface()?.scrollTop ?? window.scrollY) <= 1
    ) {
      void onRefresh();
      return;
    }
    if (
      origin.canSwipe &&
      Math.abs(dx) >= 80 &&
      Math.abs(dx) > Math.abs(dy) * 1.5
    ) {
      const current = filters.indexOf(filter);
      const next = current + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < filters.length) {
        onFilterChange(filters[next]);
        suppressClickUntil.current = Date.now() + 450;
      }
    }
  };
  const onTouchCancelCapture = () => {
    start.current = null;
    setPullDistance(0);
  };
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (Date.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil.current = 0;
    }
  };
  return {
    pullDistance,
    onTouchStartCapture,
    onTouchMoveCapture,
    onTouchEndCapture,
    onTouchCancelCapture,
    onClickCapture,
  };
}
