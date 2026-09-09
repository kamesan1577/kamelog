"use client";

import { useEffect } from "react";

const GITHUB_URL = "https://github.com/kamesan1577";
const X_URL = "https://x.com/kamesaniniad";
const QIITA_URL = "https://qiita.com/kamesan1577";
const SOCIAL_ROW_ATTRIBUTE = "data-kamelog-profile-social-links";
const SOURCE_ATTRIBUTE = "data-kamelog-profile-social-source";
const QIITA_THUMBNAIL_ATTRIBUTE = "data-kamelog-qiita-thumbnail";

type SocialLink = {
  href: string;
  label: string;
  icon: string;
  brand: "github" | "x" | "qiita";
};

const socialLinks: SocialLink[] = [
  {
    href: GITHUB_URL,
    label: "GitHub (@kamesan1577)",
    icon: "/github-mark.svg",
    brand: "github",
  },
  {
    href: X_URL,
    label: "X (@kamesaniniad)",
    icon: "/x-logo.svg",
    brand: "x",
  },
  {
    href: QIITA_URL,
    label: "Qiita (@kamesan1577)",
    icon: "/qiita-icon.svg",
    brand: "qiita",
  },
];

function createSocialLink({ href, label, icon, brand }: SocialLink) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.className = `profile-social-link profile-social-link-${brand}`;
  anchor.setAttribute("aria-label", label);
  anchor.title = label;

  const image = document.createElement("img");
  image.src = icon;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  anchor.append(image);
  return anchor;
}

function syncProfileSocialLinks() {
  for (const card of document.querySelectorAll<HTMLElement>(".profile-card")) {
    const source = card.querySelector<HTMLAnchorElement>(
      `:scope > a[href="${GITHUB_URL}"]`,
    );
    if (!source) continue;

    source.setAttribute(SOURCE_ATTRIBUTE, "");
    if (card.querySelector(`[${SOCIAL_ROW_ATTRIBUTE}]`)) continue;

    const row = document.createElement("div");
    row.className = "profile-social-links";
    row.setAttribute(SOCIAL_ROW_ATTRIBUTE, "");
    row.setAttribute("aria-label", "外部アカウント");
    for (const link of socialLinks) row.append(createSocialLink(link));
    source.insertAdjacentElement("afterend", row);
  }
}

function syncQiitaProjectThumbnail() {
  const image = document.querySelector<HTMLImageElement>(
    `a.project-tile[href="${QIITA_URL}"] img`,
  );
  if (!image) return;
  image.src = "/qiita-project.svg";
  image.alt = "Qiita";
  image.setAttribute(QIITA_THUMBNAIL_ATTRIBUTE, "");
}

function cleanup() {
  for (const row of document.querySelectorAll(`[${SOCIAL_ROW_ATTRIBUTE}]`)) {
    row.remove();
  }
  for (const source of document.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)) {
    source.removeAttribute(SOURCE_ATTRIBUTE);
  }
}

export function ProfileSocialLinksBridge() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      syncProfileSocialLinks();
      syncQiitaProjectThumbnail();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      cleanup();
    };
  }, []);

  return null;
}
