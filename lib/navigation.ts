export const navigationStateKey = "__kamelogNavigation";

export const viewPaths = Object.freeze({
  home: "/",
  timeline: "/timeline",
  projects: "/projects",
});

export type PublicView = keyof typeof viewPaths;
export type ReaderMode = "popup" | "page";

export function readerModeFromSearch(search: string): ReaderMode {
  const params = new URLSearchParams(search);
  return params.get("post") && params.get("reader") === "page"
    ? "page"
    : "popup";
}

export function isPublicView(value: unknown): value is PublicView {
  return typeof value === "string" && Object.hasOwn(viewPaths, value);
}

export function viewFromPathname(pathname: string): PublicView | null {
  for (const view of Object.keys(viewPaths) as PublicView[]) {
    if (viewPaths[view] === pathname) return view;
  }
  return null;
}

export function pathnameForView(view: string) {
  return isPublicView(view) ? viewPaths[view] : "/";
}

export function canonicalNavigationUrl(
  currentHref: string,
  navigation: { post?: string | null; view: string; readerMode?: ReaderMode },
) {
  const url = new URL(currentHref, "https://kamelog.invalid");
  if (navigation.post) {
    url.pathname = "/";
    url.searchParams.set("post", navigation.post);
  } else {
    url.pathname = pathnameForView(navigation.view);
    url.searchParams.delete("post");
  }
  if (navigation.post && navigation.readerMode === "page")
    url.searchParams.set("reader", "page");
  else url.searchParams.delete("reader");
  return url.pathname + url.search + url.hash;
}
