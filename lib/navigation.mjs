export const navigationStateKey = "__kamelogNavigation";

export const viewPaths = Object.freeze({
  home: "/",
  timeline: "/timeline",
  projects: "/projects",
  account: "/account",
});

export function isPublicView(value) {
  return Object.hasOwn(viewPaths, value);
}

export function viewFromPathname(pathname) {
  const entry = Object.entries(viewPaths).find(([, path]) => path === pathname);
  return entry?.[0] ?? null;
}

export function pathnameForView(view) {
  return viewPaths[view] ?? "/";
}

export function canonicalNavigationUrl(currentHref, navigation) {
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
