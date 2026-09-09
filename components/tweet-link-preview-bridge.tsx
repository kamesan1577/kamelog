"use client";

import { useEffect } from "react";
import { firstHttpUrl, splitTweetText } from "@/lib/tweet-links.mjs";

type LinkPreview = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
};

const previewCache = new Map<string, Promise<LinkPreview | null>>();

function loadPreview(url: string) {
  const cached = previewCache.get(url);
  if (cached) return cached;
  const request = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok || response.status === 204) return null;
      return (await response.json()) as LinkPreview;
    })
    .catch(() => null);
  previewCache.set(url, request);
  return request;
}

function previewHost(body: HTMLElement) {
  return body.closest<HTMLElement>(".post-focus") ?? body;
}

function removeExistingCard(body: HTMLElement) {
  const host = previewHost(body);
  const next = host.nextElementSibling;
  if (
    next instanceof HTMLElement &&
    next.classList.contains("tweet-link-card") &&
    next.dataset.previewOwner === "tweet-link-preview"
  ) {
    next.remove();
  }
}

function inlineLink(url: string) {
  const link = document.createElement("a");
  link.className = "tweet-inline-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.referrerPolicy = "no-referrer";
  link.textContent = url;
  link.addEventListener("click", (event) => event.stopPropagation());
  link.addEventListener("keydown", (event) => event.stopPropagation());
  return link;
}

function previewCard(url: string, preview: LinkPreview) {
  const card = document.createElement("a");
  card.className = `tweet-link-card${preview.image ? " has-image" : ""}`;
  card.href = url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.referrerPolicy = "no-referrer";
  card.dataset.previewOwner = "tweet-link-preview";
  card.dataset.previewUrl = url;

  if (preview.image) {
    const image = document.createElement("img");
    image.src = preview.image;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    card.append(image);
  }

  const copy = document.createElement("span");
  copy.className = "tweet-link-card-copy";
  const site = document.createElement("small");
  site.textContent = preview.siteName || new URL(url).hostname;
  const title = document.createElement("strong");
  title.textContent = preview.title || url;
  copy.append(site, title);
  if (preview.description) {
    const description = document.createElement("span");
    description.className = "tweet-link-card-description";
    description.textContent = preview.description;
    copy.append(description);
  }
  card.append(copy);
  return card;
}

async function attachPreview(body: HTMLElement, source: string, url: string) {
  const preview = await loadPreview(url);
  if (
    !preview ||
    !body.isConnected ||
    body.dataset.linkifiedSource !== source
  ) {
    return;
  }
  const host = previewHost(body);
  const next = host.nextElementSibling;
  if (
    next instanceof HTMLElement &&
    next.classList.contains("tweet-link-card") &&
    next.dataset.previewUrl === url
  ) {
    return;
  }
  removeExistingCard(body);
  host.insertAdjacentElement("afterend", previewCard(url, preview));
}

function enhanceTweet(body: HTMLElement) {
  const source = body.textContent ?? "";
  if (body.dataset.linkifiedSource === source) return;
  removeExistingCard(body);
  const parts = splitTweetText(source);
  const url = firstHttpUrl(source);
  if (!url) {
    body.dataset.linkifiedSource = source;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    fragment.append(
      part.type === "url"
        ? inlineLink(part.value)
        : document.createTextNode(part.value),
    );
  }
  body.replaceChildren(fragment);
  body.dataset.linkifiedSource = source;
  void attachPreview(body, source, url);
}

function scanTweets() {
  document
    .querySelectorAll<HTMLElement>(".tweet-body")
    .forEach(enhanceTweet);
}

export function TweetLinkPreviewBridge() {
  useEffect(() => {
    scanTweets();
    const observer = new MutationObserver(scanTweets);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
