export const navigationStateKey = "__kamelogNavigation";

export const viewPaths = Object.freeze({
  home: "/",
  timeline: "/timeline",
  projects: "/projects",
});

export type PublicView = keyof typeof viewPaths;

export function isPublicView(value: string): value is PublicView {
  return Object.hasOwn(viewPaths, value);
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
  navigation: { post?: string | null; view: string },
) {
  const url = new URL(currentHref);
  if (navigation.post) {
    url.pathname = "/";
    url.searchParams.set("post", navigation.post);
  } else {
    url.pathname = pathnameForView(navigation.view);
    url.searchParams.delete("post");
  }
  return url.pathname + url.search + url.hash;
}
