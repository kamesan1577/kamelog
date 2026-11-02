"use client";

import { useEffect, useId, useRef } from "react";
import { Search, X } from "lucide-react";
import "./HomeSearch.css";

export interface TimelineSearchProps {
  id: string;
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  tag: string;
  tags: { name: string; count: number }[];
  onTagChange: (tag: string) => void;
  hasMoreTags: boolean;
  onMoreTags: () => void;
  onClose: () => void;
}

export function TimelineSearch({
  id,
  open,
  query,
  onQueryChange,
  tag,
  tags,
  onTagChange,
  hasMoreTags,
  onMoreTags,
  onClose,
}: TimelineSearchProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && input.current?.getClientRects().length) input.current?.focus();
  }, [open]);

  return (
    <section
      id={id}
      data-ds="timeline-search-panel"
      role="search"
      aria-label="投稿を絞り込む"
      hidden={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div data-ds="mobile-search">
        <Search size={16} aria-hidden="true" />
        <label className="sr-only" htmlFor={inputId}>
          投稿を検索
        </label>
        <input
          ref={input}
          id={inputId}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="投稿を検索"
        />
        {query && (
          <button
            type="button"
            aria-label="検索語を消去"
            onClick={() => onQueryChange("")}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <div data-ds="inline-topics">
          <h2>タグ</h2>
          <div data-ds="topic-list">
            {tags.map(({ name, count }) => (
              <button
                key={name}
                type="button"
                aria-pressed={tag === name}
                onClick={() => onTagChange(tag === name ? "" : name)}
              >
                #{name}
                <small>{count}</small>
              </button>
            ))}
          </div>
          {hasMoreTags && (
            <button type="button" data-ds="tag-load-more" onClick={onMoreTags}>
              もっと見る
            </button>
          )}
        </div>
      )}
    </section>
  );
}
