"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, MessageCircle, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import styles from "./tweet-thread-bridge.module.css";

export type ThreadPost = {
  id: string;
  kind: "blog" | "tweet" | "vlog";
  title: string;
  body: string;
  date: string;
  parentId?: string;
  images?: string[];
};

type ThreadNode = {
  post: ThreadPost;
  children: ThreadNode[];
};

type Hosts = {
  before: HTMLElement | null;
  after: HTMLElement | null;
};

const navigationStateKey = "__kamelogNavigation";

function buildAncestors(posts: ThreadPost[], selected: ThreadPost) {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const ancestors: ThreadPost[] = [];
  const seen = new Set([selected.id]);
  let cursor = selected;
  while (cursor.parentId) {
    const parent = byId.get(cursor.parentId);
    if (!parent || parent.kind !== "tweet" || seen.has(parent.id)) break;
    ancestors.unshift(parent);
    seen.add(parent.id);
    cursor = parent;
  }
  return ancestors;
}

function buildChildren(
  posts: ThreadPost[],
  parentId: string,
  seen = new Set<string>(),
): ThreadNode[] {
  return posts
    .filter((post) => post.kind === "tweet" && post.parentId === parentId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((post) => {
      if (seen.has(post.id)) return [];
      const nextSeen = new Set(seen);
      nextSeen.add(post.id);
      return [
        {
          post,
          children: buildChildren(posts, post.id, nextSeen),
        },
      ];
    });
}

function countNodes(nodes: ThreadNode[]): number {
  return nodes.reduce(
    (count, node) => count + 1 + countNodes(node.children),
    0,
  );
}

function postHref(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("post", id);
  return url.pathname + url.search + url.hash;
}

function openThreadPost(id: string) {
  const state =
    window.history.state &&
    typeof window.history.state === "object" &&
    !Array.isArray(window.history.state)
      ? window.history.state
      : {};
  const nextState = {
    ...state,
    [navigationStateKey]: { view: "home", post: id, internal: true },
  };
  window.history.pushState(nextState, "", postHref(id));
  window.location.reload();
}

function ThreadCard({ post, depth = 0 }: { post: ThreadPost; depth?: number }) {
  const indent = Math.min(depth, 3) * 18;
  return (
    <button
      type="button"
      className={styles.card}
      style={{
        marginInlineStart: indent,
        width: `calc(100% - ${indent}px)`,
      }}
      onClick={() => openThreadPost(post.id)}
    >
      <span className={styles.cardMeta}>
        <MessageCircle size={13} />
        {new Date(post.date).toLocaleDateString("ja-JP", {
          month: "numeric",
          day: "numeric",
        })}
      </span>
      <span className={styles.cardBody}>{post.body || "画像のつぶやき"}</span>
      <span className={styles.openLabel}>
        この投稿を開く <ChevronRight size={14} />
      </span>
      {!!post.images?.length && (
        <span className={styles.images}>
          {post.images.slice(0, 4).map((image, index) => (
            <Image
              key={image}
              src={image}
              alt={`添付画像 ${index + 1}`}
              width={480}
              height={270}
              unoptimized
            />
          ))}
        </span>
      )}
    </button>
  );
}

function ThreadTree({
  nodes,
  depth = 0,
}: {
  nodes: ThreadNode[];
  depth?: number;
}) {
  return nodes.map((node) => (
    <Fragment key={node.post.id}>
      <ThreadCard post={node.post} depth={depth} />
      {node.children.length > 0 && (
        <ThreadTree nodes={node.children} depth={depth + 1} />
      )}
    </Fragment>
  ));
}

export default function TweetThreadBridge({
  initialPosts,
}: {
  initialPosts: ThreadPost[];
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [hosts, setHosts] = useState<Hosts>({ before: null, after: null });
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void api<{ authenticated: boolean }>("auth/session")
      .then((session) => setAuthenticated(session.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const id = new URL(window.location.href).searchParams.get("post");
        const detail = document.querySelector<HTMLElement>(".detail-page");
        setSelectedId(id);
        if (!id || !detail) {
          setHosts({ before: null, after: null });
          return;
        }

        let before = detail.querySelector<HTMLElement>(
          "[data-kamelog-thread-before]",
        );
        if (!before) {
          before = document.createElement("div");
          before.dataset.kamelogThreadBefore = "true";
          const back = detail.querySelector(".back-button");
          if (back?.nextSibling) detail.insertBefore(before, back.nextSibling);
          else detail.appendChild(before);
        }

        let after = detail.querySelector<HTMLElement>(
          "[data-kamelog-thread-after]",
        );
        if (!after) {
          after = document.createElement("div");
          after.dataset.kamelogThreadAfter = "true";
          detail.appendChild(after);
        }

        setHosts((current) =>
          current.before === before && current.after === after
            ? current
            : { before, after },
        );
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", sync);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void api<ThreadPost[]>("posts")
      .then((nextPosts) => {
        if (!cancelled) setPosts(nextPosts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = posts.find((post) => post.id === selectedId);
  const ancestors = useMemo(
    () => (selected?.kind === "tweet" ? buildAncestors(posts, selected) : []),
    [posts, selected],
  );
  const children = useMemo(
    () => (selected?.kind === "tweet" ? buildChildren(posts, selected.id) : []),
    [posts, selected],
  );

  if (!selected || selected.kind !== "tweet") return null;

  const submit = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const saved = await api<ThreadPost>("posts", "POST", {
        kind: "tweet",
        title: "",
        body: text,
        tags: [],
        pinned: false,
        images: [],
        parentId: selected.id,
      });
      setPosts((current) => [saved, ...current]);
      setBody("");
      setComposing(false);
      toast.success("続きをつなげました");
      openThreadPost(saved.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "続きを投稿できませんでした。",
      );
    } finally {
      setSending(false);
    }
  };

  const before = hosts.before
    ? createPortal(
        <section
          className={styles.before}
          aria-label="スレッドの概要と前の投稿"
        >
          <header className={styles.header}>
            <div>
              <span className={styles.eyebrow}>THREAD</span>
              <h1>スレッド</h1>
            </div>
            <span className={styles.count}>
              {ancestors.length + 1 + countNodes(children)}件
            </span>
          </header>
          {ancestors.length > 0 && (
            <div className={styles.ancestors}>
              {ancestors.map((post) => (
                <ThreadCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>,
        hosts.before,
      )
    : null;

  const after = hosts.after
    ? createPortal(
        <section className={styles.after} aria-label="このつぶやきの続き">
          {children.length > 0 && (
            <div className={styles.children} aria-label="続きの投稿">
              <span className={styles.sectionLabel}>この先の投稿</span>
              <ThreadTree nodes={children} />
            </div>
          )}
          {authenticated && (
            <div className={styles.append}>
              {!composing ? (
                <button
                  type="button"
                  className={styles.appendButton}
                  onClick={() => setComposing(true)}
                >
                  <Plus size={16} />
                  続きをつなげる
                </button>
              ) : (
                <div className={styles.composer}>
                  <div className={styles.composerHeader}>
                    <strong>続きをつなげる</strong>
                    <button
                      type="button"
                      aria-label="追記を閉じる"
                      onClick={() => {
                        setComposing(false);
                        setBody("");
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    value={body}
                    maxLength={5000}
                    placeholder="続きのつぶやき"
                    onChange={(event) => setBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        (event.ctrlKey || event.metaKey) &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                  />
                  <div className={styles.composerActions}>
                    <span>{body.length}/5000</span>
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!body.trim() || sending}
                    >
                      {sending ? "投稿中…" : "つなげる"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>,
        hosts.after,
      )
    : null;

  return (
    <>
      {before}
      {after}
    </>
  );
}
