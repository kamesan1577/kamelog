"use client";

import { useLayoutEffect } from "react";
import {
  canonicalNavigationUrl,
  isPublicView,
  navigationStateKey,
  viewFromPathname,
} from "@/lib/navigation.mjs";

type View = "home" | "timeline" | "projects" | "account";
type NavigationState = {
  view: View;
  post: string | null;
  internal: boolean;
};

type HistoryUrl = string | URL | null | undefined;

function baseState(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNavigationState(value: unknown): NavigationState | null {
  const candidate = baseState(value)[navigationStateKey];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return null;
  const { view, post, internal } = candidate as Partial<NavigationState>;
  if (!isPublicView(view)) return null;
  if (post != null && typeof post !== "string") return null;
  return {
    view: view as View,
    post: post ?? null,
    internal: internal === true,
  };
}

function rewriteEntry(
  state: unknown,
  url: HistoryUrl,
): { state: unknown; url: HistoryUrl } {
  const href = new URL(
    url?.toString() || window.location.href,
    window.location.href,
  );

  // A Next.js route transition must keep its requested URL. Do not carry the
  // notebook's view state into /federation or back into a fresh notebook page.
  if (
    !viewFromPathname(href.pathname) ||
    href.pathname !== window.location.pathname
  ) {
    const previous = baseState(state);
    if (!Object.hasOwn(previous, navigationStateKey)) return { state, url };
    const clean = { ...previous };
    delete clean[navigationStateKey];
    return { state: clean, url };
  }

  // Notebook changes views by writing a state for the current pathname.
  const navigation = readNavigationState(state);
  return {
    state,
    url: navigation ? canonicalNavigationUrl(href.href, navigation) : url,
  };
}

export function NavigationUrlBridge() {
  useLayoutEffect(() => {
    const history = window.history;
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const pathView = viewFromPathname(window.location.pathname);
    // Only notebook routes need an initial navigation state. In particular,
    // a direct visit to /federation must not be rewritten to the home page.
    if (pathView && isPublicView(pathView)) {
      const post = new URL(window.location.href).searchParams.get("post");
      const initialNavigation: NavigationState = {
        view: post ? "home" : (pathView as View),
        post,
        internal: false,
      };
      const initialState = {
        ...baseState(history.state),
        [navigationStateKey]: initialNavigation,
      };
      originalReplaceState(
        initialState,
        "",
        canonicalNavigationUrl(window.location.href, initialNavigation),
      );
    }

    history.pushState = ((state, unused, url) => {
      const entry = rewriteEntry(state, url);
      return originalPushState(entry.state, unused, entry.url);
    }) as History["pushState"];
    history.replaceState = ((state, unused, url) => {
      const entry = rewriteEntry(state, url);
      return originalReplaceState(entry.state, unused, entry.url);
    }) as History["replaceState"];

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  return null;
}
