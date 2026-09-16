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

function rewriteUrl(
  state: unknown,
  url: string | URL | null | undefined,
): string | URL | null | undefined {
  const navigation = readNavigationState(state);
  if (!navigation) return url;
  const href = new URL(url?.toString() || window.location.href, window.location.href)
    .href;
  return canonicalNavigationUrl(href, navigation);
}

export function NavigationUrlBridge() {
  useLayoutEffect(() => {
    const history = window.history;
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const params = new URL(window.location.href).searchParams;
    const post = params.get("post");
    const pathView = viewFromPathname(window.location.pathname);
    const view: View = post
      ? "home"
      : pathView && isPublicView(pathView)
        ? (pathView as View)
        : "home";
    const initialNavigation: NavigationState = {
      view,
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

    history.pushState = ((state, unused, url) =>
      originalPushState(state, unused, rewriteUrl(state, url))) as History["pushState"];
    history.replaceState = ((state, unused, url) =>
      originalReplaceState(
        state,
        unused,
        rewriteUrl(state, url),
      )) as History["replaceState"];

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  return null;
}
