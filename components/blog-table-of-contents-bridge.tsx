"use client";

import { useEffect } from "react";

import { buildTocEntries } from "@/lib/blog-toc.mjs";

const DETAIL_MARKDOWN_SELECTOR = ".detail-page .markdown";
const HEADING_SELECTOR = "h2,h3,h4,h5,h6";
const TOC_ATTRIBUTE = "data-kamelog-blog-toc";
const GENERATED_HEADING_ATTRIBUTE = "data-kamelog-toc-generated";

type TocEntry = {
  id: string;
  label: string;
  level: number;
};

function generatedHeadings() {
  return document.querySelectorAll<HTMLElement>(
    `[${GENERATED_HEADING_ATTRIBUTE}="true"]`,
  );
}

function clearGeneratedHeadingIds() {
  for (const heading of generatedHeadings()) {
    heading.removeAttribute("id");
    heading.removeAttribute(GENERATED_HEADING_ATTRIBUTE);
  }
}

function removeGeneratedToc() {
  for (const toc of document.querySelectorAll(`[${TOC_ATTRIBUTE}]`)) toc.remove();
}

function renderToc(markdown: HTMLElement) {
  clearGeneratedHeadingIds();

  const headings = Array.from(
    markdown.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
  );
  const source = headings.map((heading) => ({
    id: heading.id,
    label: heading.textContent || "",
    level: Number(heading.tagName.slice(1)),
  }));
  const entries = buildTocEntries(source) as TocEntry[];
  const visibleHeadings = headings.filter((heading) =>
    (heading.textContent || "").trim(),
  );

  for (const [index, entry] of entries.entries()) {
    const heading = visibleHeadings[index];
    if (!heading) continue;
    if (heading.id !== entry.id) {
      heading.id = entry.id;
      heading.setAttribute(GENERATED_HEADING_ATTRIBUTE, "true");
    }
  }

  const signature = JSON.stringify(entries);
  const current = document.querySelector<HTMLElement>(`[${TOC_ATTRIBUTE}]`);
  if (!entries.length) {
    current?.remove();
    return;
  }

  const parent = markdown.parentElement;
  if (!parent) return;

  if (
    current &&
    current.dataset.signature === signature &&
    current.parentElement === parent
  ) {
    if (current.nextElementSibling !== markdown) {
      parent.insertBefore(current, markdown);
    }
    return;
  }

  removeGeneratedToc();

  const nav = document.createElement("nav");
  nav.className = "blog-table-of-contents";
  nav.setAttribute(TOC_ATTRIBUTE, "");
  nav.setAttribute("aria-label", "目次");
  nav.dataset.signature = signature;

  const title = document.createElement("p");
  title.className = "blog-table-of-contents-title";
  title.textContent = "目次";
  nav.append(title);

  const list = document.createElement("ol");
  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `blog-table-of-contents-level-${Math.min(
      6,
      Math.max(2, entry.level),
    )}`;

    const link = document.createElement("a");
    link.href = `#${entry.id}`;
    link.textContent = entry.label;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById(entry.id)?.scrollIntoView({ block: "start" });
    });

    item.append(link);
    list.append(item);
  }
  nav.append(list);
  parent.insertBefore(nav, markdown);
}

export function BlogTableOfContentsBridge() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      const markdown = document.querySelector<HTMLElement>(
        DETAIL_MARKDOWN_SELECTOR,
      );
      if (!markdown) {
        clearGeneratedHeadingIds();
        removeGeneratedToc();
        return;
      }
      renderToc(markdown);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    schedule();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearGeneratedHeadingIds();
      removeGeneratedToc();
    };
  }, []);

  return null;
}
