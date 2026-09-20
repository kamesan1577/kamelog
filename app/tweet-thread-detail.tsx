"use client";

import Image from "next/image";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronRight, MessageCircle, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { buildXIntentUrl } from "@/lib/x-intent.mjs";
import { hasTweetContent, tweetPostInput } from "@/lib/tweet-composer.mjs";
import { toast } from "sonner";
import styles from "@/components/design-system/patterns/TweetThreadDetail.module.css";

export type ThreadPost = {
  id: string;
  kind: "blog" | "tweet" | "vlog";
  title: string;
  body: string;
  date: string;
  parentId?: string;
  effectiveParentId?: string;
  images?: string[];
  federationEnabled?: boolean;
};

type ThreadNode = {
  post: ThreadPost;
  children: ThreadNode[];
};

type ReplyDraft = {
  id: string;
  revision?: number;
  kind: "tweet";
  body: string;
  images?: string[];
  parentId?: string;
};

function buildAncestors(posts: ThreadPost[], selected: ThreadPost) {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const ancestors: ThreadPost[] = [];
  const seen = new Set([selected.id]);
  let cursor = selected;
  let parentId = cursor.effectiveParentId || cursor.parentId;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent || parent.kind !== "tweet" || seen.has(parent.id)) break;
    ancestors.unshift(parent);
    seen.add(parent.id);
    cursor = parent;
    parentId = cursor.effectiveParentId || cursor.parentId;
  }
  return ancestors;
}

function buildChildren(
  posts: ThreadPost[],
  parentId: string,
  seen = new Set<string>(),
): ThreadNode[] {
  return posts
    .filter(
      (post) =>
        post.kind === "tweet" &&
        (post.effectiveParentId || post.parentId) === parentId,
    )
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

function ThreadCard({
  post,
  depth = 0,
  onOpenPost,
}: {
  post: ThreadPost;
  depth?: number;
  onOpenPost: (id: string) => void;
}) {
  const indent = Math.min(depth, 3) * 18;
  return (
    <button
      type="button"
      className={styles.card}
      style={{
        marginInlineStart: indent,
        width: `calc(100% - ${indent}px)`,
      }}
      onClick={() => onOpenPost(post.id)}
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
  onOpenPost,
}: {
  nodes: ThreadNode[];
  depth?: number;
  onOpenPost: (id: string) => void;
}) {
  return nodes.map((node) => (
    <Fragment key={node.post.id}>
      <ThreadCard post={node.post} depth={depth} onOpenPost={onOpenPost} />
      {node.children.length > 0 && (
        <ThreadTree
          nodes={node.children}
          depth={depth + 1}
          onOpenPost={onOpenPost}
        />
      )}
    </Fragment>
  ));
}

export default function TweetThreadDetail({
  posts,
  selectedId,
  authenticated,
  federationAvailable,
  onOpenPost,
  onPostCreated,
  children,
  enabled = true,
}: {
  posts: ThreadPost[];
  selectedId: string | null;
  authenticated: boolean;
  federationAvailable: boolean;
  onOpenPost: (id: string) => void;
  onPostCreated: (post: ThreadPost) => void;
  children?: ReactNode;
  enabled?: boolean;
}) {
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [federationEnabled, setFederationEnabled] = useState(true);
  const [xIntent, setXIntent] = useState(true);
  const [xFallback, setXFallback] = useState<string | null>(null);
  const [closeAsk, setCloseAsk] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | undefined>();
  const [replyDrafts, setReplyDrafts] = useState<ReplyDraft[]>([]);
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !authenticated) return;
    void api<ReplyDraft[]>("drafts")
      .then((drafts) =>
        setReplyDrafts(drafts.filter((draft) => draft.parentId)),
      )
      .catch(() => undefined);
  }, [authenticated, enabled]);

  useEffect(() => {
    try {
      const storedXIntent =
        localStorage.getItem("kamelog:x-intent:tweet") !== "false";
      queueMicrotask(() => setXIntent(storedXIntent));
    } catch {
      queueMicrotask(() => setXIntent(true));
    }
  }, []);

  const selected = posts.find((post) => post.id === selectedId);
  const selectedParentMissing = Boolean(
    selected?.kind === "tweet" &&
    (selected.effectiveParentId || selected.parentId) &&
    !posts.some(
      (post) =>
        post.id === (selected.effectiveParentId || selected.parentId) &&
        post.kind === "tweet",
    ),
  );
  const ancestors = useMemo(
    () => (selected?.kind === "tweet" ? buildAncestors(posts, selected) : []),
    [posts, selected],
  );
  const childNodes = useMemo(
    () => (selected?.kind === "tweet" ? buildChildren(posts, selected.id) : []),
    [posts, selected],
  );

  const dirty = body.length > 0 || images.length > 0;
  const closeComposer = useCallback(() => {
    if (dirty) setCloseAsk(true);
    else setComposing(false);
  }, [dirty]);

  useEffect(() => {
    if (!composing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeComposer();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) closeComposer();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeComposer, composing]);

  if (!selected || selected.kind !== "tweet") return children;

  const submit = async () => {
    const text = body.trim();
    if (!hasTweetContent(text, images) || sending || uploading) return;
    setSending(true);
    try {
      const saved = await api<ThreadPost>(
        "posts",
        "POST",
        tweetPostInput({
          body: text,
          images,
          parentId: selected.id,
          federationEnabled:
            federationEnabled && selected.federationEnabled !== false,
        }),
      );
      onPostCreated(saved);
      setBody("");
      setImages([]);
      if (draftId) {
        try {
          await api(`drafts/${draftId}`, "DELETE", undefined, {
            "If-Match": String(draftRevision),
          });
          setReplyDrafts((current) =>
            current.filter((draft) => draft.id !== draftId),
          );
        } catch {
          toast.error("投稿済みです。下書きの削除だけ失敗しました。");
        }
        setDraftId(null);
        setDraftRevision(undefined);
      }
      setComposing(false);
      toast.success("続きをつなげました");
      if (xIntent) {
        const url = new URL("/", window.location.origin);
        url.searchParams.set("post", saved.id);
        const intent = buildXIntentUrl(saved, url.toString());
        try {
          const popup = window.open(intent, "_blank", "noopener,noreferrer");
          if (!popup) setXFallback(intent);
        } catch {
          setXFallback(intent);
        }
      }
      onOpenPost(saved.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "続きを投稿できませんでした。",
      );
    } finally {
      setSending(false);
    }
  };

  const uploadImages = async (files: File[]) => {
    const accepted = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, 4 - images.length));
    if (!accepted.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of accepted) {
        const response = await fetch("/api/media?kind=image", {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "画像を追加できませんでした。");
        uploaded.push(result.url);
      }
      setImages((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "画像を追加できませんでした。",
      );
    } finally {
      setUploading(false);
    }
  };

  const saveDraft = async () => {
    try {
      const saved = await api<ReplyDraft>(
        draftId ? `drafts/${draftId}` : "drafts",
        draftId ? "PUT" : "POST",
        {
          kind: "tweet",
          title: "",
          body,
          images,
          parentId: selected.id,
          ...(draftId && draftRevision !== undefined
            ? { revision: draftRevision }
            : {}),
        },
      );
      setReplyDrafts((current) => [
        saved,
        ...current.filter((draft) => draft.id !== saved.id),
      ]);
      setDraftId(saved.id);
      setDraftRevision(saved.revision);
      setBody("");
      setImages([]);
      setCloseAsk(false);
      setComposing(false);
      toast.success("下書きを保存しました");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "下書きを保存できませんでした。",
      );
    }
  };

  const before = (
    <section
      data-ds="thread-detail-before"
      className={styles.before}
      aria-label="スレッドの概要と前の投稿"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>THREAD</span>
          <h1>スレッド</h1>
        </div>
        <span className={styles.count}>
          {ancestors.length + 1 + countNodes(childNodes)}件
        </span>
      </header>
      {ancestors.length > 0 && (
        <div className={styles.ancestors}>
          {ancestors.map((post) => (
            <ThreadCard key={post.id} post={post} onOpenPost={onOpenPost} />
          ))}
        </div>
      )}
      {selectedParentMissing && (
        <p className={styles.parentMissing}>返信先は表示できません</p>
      )}
    </section>
  );

  const after = (
    <section
      data-ds="thread-detail-after"
      className={styles.after}
      aria-label="このつぶやきの続き"
    >
      {childNodes.length > 0 && (
        <div className={styles.children} aria-label="続きの投稿">
          <span className={styles.sectionLabel}>この先の投稿</span>
          <ThreadTree nodes={childNodes} onOpenPost={onOpenPost} />
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
            <div
              ref={composerRef}
              data-ds="reply-composer"
              className={styles.composer}
            >
              <div className={styles.composerHeader}>
                <strong>続きをつなげる</strong>
                {replyDrafts.some(
                  (draft) => draft.parentId === selected.id,
                ) && (
                  <select
                    aria-label="返信下書き"
                    value={draftId || ""}
                    onChange={(event) => {
                      const draft = replyDrafts.find(
                        (item) => item.id === event.target.value,
                      );
                      if (!draft) return;
                      setDraftId(draft.id);
                      setDraftRevision(draft.revision);
                      setBody(draft.body);
                      setImages(draft.images || []);
                    }}
                  >
                    <option value="">下書きから復元</option>
                    {replyDrafts
                      .filter((draft) => draft.parentId === selected.id)
                      .map((draft) => (
                        <option key={draft.id} value={draft.id}>
                          {draft.body.slice(0, 24) || "画像の返信"}
                        </option>
                      ))}
                  </select>
                )}
                <button
                  type="button"
                  aria-label="追記を閉じる"
                  onClick={closeComposer}
                >
                  <X size={17} />
                </button>
              </div>
              <p className={styles.replyTarget}>
                <a href={postHref(selected.id)}>
                  「{selected.body || "画像のつぶやき"}」
                </a>
                への返信
              </p>
              <textarea
                data-tweet-composer-textarea="true"
                autoFocus
                value={body}
                maxLength={5000}
                placeholder="続きのつぶやき"
                onChange={(event) => setBody(event.target.value)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void uploadImages(Array.from(event.dataTransfer.files));
                }}
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
              {images.length > 0 && (
                <div className={styles.imageGrid} aria-label="添付画像">
                  {images.map((image, index) => (
                    <div key={image}>
                      <Image
                        src={image}
                        alt={`添付画像 ${index + 1}`}
                        width={180}
                        height={100}
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setImages((current) =>
                            current.filter((item) => item !== image),
                          )
                        }
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.composerOptions}>
                <label className="image-upload-button">
                  画像
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    hidden
                    onChange={(event) => {
                      void uploadImages(Array.from(event.target.files || []));
                      event.target.value = "";
                    }}
                  />
                </label>
                <label>
                  Xにも投稿
                  <input
                    type="checkbox"
                    role="switch"
                    checked={xIntent}
                    onChange={(event) => {
                      setXIntent(event.target.checked);
                      try {
                        localStorage.setItem(
                          "kamelog:x-intent:tweet",
                          String(event.target.checked),
                        );
                      } catch {}
                    }}
                  />
                </label>
                {federationAvailable && (
                  <label
                    title={
                      selected.federationEnabled === false
                        ? "親投稿がFediverse非公開のため配信できません"
                        : undefined
                    }
                  >
                    Fediverseにも配信
                    <input
                      type="checkbox"
                      role="switch"
                      checked={
                        federationEnabled &&
                        selected.federationEnabled !== false
                      }
                      disabled={selected.federationEnabled === false}
                      onChange={(event) =>
                        setFederationEnabled(event.target.checked)
                      }
                    />
                  </label>
                )}
              </div>
              <div className={styles.composerActions}>
                <span>{body.length}/5000</span>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={
                    (!body.trim() && !images.length) || sending || uploading
                  }
                >
                  {uploading ? "画像処理中…" : sending ? "投稿中…" : "つなげる"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );

  const closeDialog = closeAsk ? (
    <div
      className={styles.closeDialog}
      role="dialog"
      aria-modal="true"
      aria-label="返信を閉じる"
    >
      <p>入力中の返信をどうしますか？</p>
      <button type="button" onClick={() => setCloseAsk(false)}>
        編集を続ける
      </button>
      <button
        type="button"
        onClick={() => {
          setBody("");
          setImages([]);
          setCloseAsk(false);
          setComposing(false);
        }}
      >
        破棄
      </button>
      <button type="button" onClick={() => void saveDraft()}>
        下書き保存
      </button>
    </div>
  ) : null;

  return (
    <>
      {before}
      {children}
      {after}
      {closeDialog}
      {xFallback && (
        <a
          className={styles.xFallback}
          href={xFallback}
          target="_blank"
          rel="noopener noreferrer"
        >
          Xで開く
        </a>
      )}
    </>
  );
}
