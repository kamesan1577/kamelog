"use client";

import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  THEME_STORAGE_KEY,
  themePreference,
  type ColorTheme,
  type ThemePreference,
} from "@/lib/theme";

const listeners = new Set<() => void>();
const serverSnapshot = "system:light:pending";
let currentPreference: ThemePreference | undefined;

function getPreference() {
  if (currentPreference === undefined) {
    try {
      currentPreference = themePreference(
        localStorage.getItem(THEME_STORAGE_KEY),
      );
    } catch {
      currentPreference = themePreference(
        document.documentElement.dataset.theme,
      );
    }
  }
  return currentPreference;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function applyPreference(preference: ThemePreference) {
  currentPreference = preference;
  document.documentElement.dataset.theme = preference;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    "meta[data-theme-color]",
  )) {
    meta.media =
      preference === "system"
        ? `(prefers-color-scheme: ${meta.dataset.themeColor})`
        : preference === meta.dataset.themeColor
          ? "all"
          : "not all";
  }
  notify();
}

function onStorage(event: StorageEvent) {
  if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
  try {
    if (event.storageArea !== localStorage) return;
  } catch {
    return;
  }
  applyPreference(themePreference(event.newValue));
}

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  media.addEventListener("change", listener);
  return () => {
    media.removeEventListener("change", listener);
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  const preference = getPreference();
  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  return `${preference}:${resolved}:ready`;
}

function setPreference(value: ThemePreference) {
  const preference = themePreference(value);
  applyPreference(preference);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be disabled or full. The current page still honors the choice.
  }
}

export function useTheme() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => serverSnapshot,
  );
  // React does not execute scripts when it mounts a client-side error document.
  // Restore its root before paint, retaining even an unpersisted local choice.
  useLayoutEffect(() => {
    applyPreference(getPreference());
  }, []);
  const [preference, resolved] = snapshot.split(":");
  const resolvedTheme: ColorTheme = resolved === "dark" ? "dark" : "light";
  return {
    preference: themePreference(preference),
    resolvedTheme,
    setPreference,
    ready: snapshot !== serverSnapshot,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useTheme();
  return children;
}
