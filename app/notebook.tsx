"use client";
import { isValidElement, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Columns2,
  Code2,
  Eye,
  FileText,
  Globe,
  Heart,
  Home,
  Image as ImageIcon,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Maximize2,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/notion/button";
import { Badge } from "@/components/notion/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { api, signIn } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { shouldAutoplayVlog, socialCopy } from "@/lib/social";
import "./landing.css";

type Kind = "blog" | "tweet" | "vlog";
type BlogEditorMode = "edit" | "preview" | "split";
type View = "home" | "timeline" | "projects" | "account";
type Post = {
  revision?: number;
  id: string;
  kind: Kind;
  title: string;
  body: string;
  date: string;
  updatedAt?: string;
  tags: string[];
  likes: number;
  video?: string;
  time?: string;
  pinned?: boolean;
  images?: string[];
};
type Draft = {
  revision?: number;
  id: string;
  kind: "blog" | "tweet";
  title: string;
  body: string;
  savedAt: string;
  images?: string[];
};
type NavigationState = {
  view: View;
  post: string | null;
  internal: boolean;
};
const label: Record<Kind, string> = {
  blog: "ブログ",
  tweet: "つぶやき",
  vlog: "vlog",
};
const navigationStateKey = "__kamelogNavigation";

function baseHistoryState(): Record<string, unknown> {
  const state = window.history.state;
  return state && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}
function isView(value: unknown): value is View {
  return (
    value === "home" ||
    value === "timeline" ||
    value === "projects" ||
    value === "account"
  );
}
function readNavigationState(): NavigationState | null {
  const candidate = baseHistoryState()[navigationStateKey];
  if (!candidate || typeof candidate !== "object") return null;
  if (Array.isArray(candidate)) return null;
  const { view, post, internal } = candidate as Partial<NavigationState>;
  if (!isView(view)) return null;
  if (post != null && typeof post !== "string") return null;
  return { view, post: post ?? null, internal: internal === true };
}
function postFromLocation() {
  return new URL(window.location.href).searchParams.get("post");
}
function navigationUrl(post: string | null) {
  const url = new URL(window.location.href);
  if (post) url.searchParams.set("post", post);
  else url.searchParams.delete("post");
  return url.pathname + url.search + url.hash;
}
function navigationHistoryState(next: NavigationState) {
  return { ...baseHistoryState(), [navigationStateKey]: next };
}

function Avatar({
  value = "🐢",
  large = false,
}: {
  value?: string;
  large?: boolean;
}) {
  return (
    <span className={"avatar " + (large ? "large" : "")}>
      {value.startsWith("data:image/") ? (
        <img src={value} alt="プロフィール" />
      ) : (
        value
      )}
    </span>
  );
}
function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replaceAll(":", "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
      });
      try {
        const result = await mermaid.render("mermaid-" + id, chart);
        if (active) setSvg(result.svg);
      } catch {
        if (active) setError(true);
      }
    });
    return () => {
      active = false;
    };
  }, [chart, id]);
  if (error)
    return (
      <pre className="mermaid-error">Mermaidの記法を確認してください。</pre>
    );
  return (
    <div
      className="mermaid-diagram"
      aria-label="Mermaid図"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function EmbeddedLink({ href }: { href: string }) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const youtube = /^(www\.)?(youtube\.com|youtu\.be)$/.test(url.hostname)
    ? url.hostname.endsWith("youtu.be")
      ? url.pathname.slice(1)
      : url.searchParams.get("v") ||
        url.pathname.match(/^\/shorts\/([^/]+)/)?.[1]
    : null;
  if (youtube && /^[\w-]{6,20}$/.test(youtube))
    return (
      <div className="social-embed">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtube}`}
          title="YouTube動画"
          loading="lazy"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  const tweet = /^(www\.)?(x\.com|twitter\.com)$/.test(url.hostname)
    ? url.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1]
    : null;
  if (tweet)
    return (
      <div className="social-embed x-embed">
        <iframe
          src={`https://platform.twitter.com/embed/Tweet.html?id=${tweet}&theme=light`}
          title="Xの投稿"
          loading="lazy"
        />
      </div>
    );
  return null;
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        skipHtml
        components={{
          code({ className, children }) {
            return className?.split(" ").includes("language-mermaid") ? (
              <MermaidDiagram chart={String(children).trim()} />
            ) : (
              <code className={className}>{children}</code>
            );
          },
          pre({ children }) {
            return isValidElement<{ className?: string; children?: unknown }>(
              children,
            ) &&
              children.props.className
                ?.split(" ")
                .includes("language-mermaid") ? (
              <MermaidDiagram chart={String(children.props.children).trim()} />
            ) : (
              <pre>{children}</pre>
            );
          },
          p({ children }) {
            const child =
              Array.isArray(children) && children.length === 1
                ? children[0]
                : children;
            if (isValidElement<{ href?: string }>(child) && child.props.href) {
              const embed = <EmbeddedLink href={child.props.href} />;
              if (
                /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|x\.com|twitter\.com)\//.test(
                  child.props.href,
                )
              )
                return embed;
            }
            return <p>{children}</p>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ImageGallery({ images = [] }: { images?: string[] }) {
  const [large, setLarge] = useState<string | null>(null);
  if (!images.length) return null;
  return (
    <>
      <div className={`image-grid count-${images.length}`}>
        {images.map((src, index) => (
          <button
            type="button"
            key={src}
            onClick={() => setLarge(src)}
            aria-label={`画像${index + 1}を拡大`}
          >
            <img src={src} alt={`添付画像 ${index + 1}`} />
          </button>
        ))}
      </div>
      <Dialog open={!!large} onOpenChange={(open) => !open && setLarge(null)}>
        <DialogContent className="image-lightbox">
          <DialogTitle>添付画像</DialogTitle>
          {large && <img src={large} alt="拡大した添付画像" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const markdownHelp = [
  ["段落", "空行で段落を分ける", "1つ目の段落\n\n2つ目の段落"],
  ["改行", "行末に半角スペース2つ、または \\ を置く", "1行目  \n2行目"],
  ["見出し", "# は1〜6個まで使える", "## 見出し2\n### 見出し3"],
  ["太字", "文字を ** で囲む", "**太字**"],
  ["斜体", "文字を _ で囲む", "_斜体_"],
  ["取り消し線", "文字を ~~ で囲む", "~~取り消し~~"],
  ["箇条書き", "-、*、+ のいずれかを使う", "- 項目1\n- 項目2"],
  ["番号付きリスト", "数字とピリオドを使う", "1. 項目1\n2. 項目2"],
  ["入れ子リスト", "子項目をスペースで字下げする", "- 親\n  - 子"],
  [
    "チェックリスト",
    "角括弧内には半角スペースか x を入れる",
    "- [ ] 未完了\n- [x] 完了",
  ],
  ["引用", "行頭に > を付ける", "> 引用文"],
  ["リンク", "表示文字とURLを書く", "[リンク](https://example.com)"],
  [
    "URLの自動リンク",
    "URLまたはメールアドレスを山括弧で囲む",
    "<https://example.com>",
  ],
  [
    "画像",
    "先頭に ! を付け、代替テキストと画像URLを書く",
    "![代替テキスト](https://example.com/image.png)",
  ],
  ["インラインコード", "文字を ` で囲む", "`const value = 1`"],
  [
    "コードブロック",
    "``` の直後に言語名を書くと色分けされる",
    "```javascript\nconst answer = 42;\n```",
  ],
  [
    "表",
    "2行目で列と位置揃えを指定する",
    "| 左 | 中央 | 右 |\n| :-- | :--: | --: |\n| A | B | C |",
  ],
  ["区切り線", "ハイフンを3個以上並べる", "---"],
  [
    "エスケープ",
    "記号の直前に \\ を置いて、そのまま表示する",
    "\\*斜体にしない\\*",
  ],
] as const;

export function PreviewShell() {
  const [mode, setMode] = useState("auto"),
    [w, setW] = useState(1280);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const o = new ResizeObserver((e) => setW(e[0].contentRect.width));
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  const width =
    mode === "mobile" ? Math.min(390, w) : mode === "desktop" ? 1280 : w;
  const scale = mode === "desktop" ? Math.min(1, w / 1280) : 1;
  return (
    <div className="preview-shell">
      <header className="preview-toolbar">
        <span className="preview-brand">
          <b>kamelog</b>
          <span className="mock-label">モック</span>
        </span>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="auto">自動</TabsTrigger>
            <TabsTrigger value="desktop">PC</TabsTrigger>
            <TabsTrigger value="mobile">スマホ</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="preview-size">
          {mode === "auto"
            ? "レスポンシブ"
            : mode === "desktop"
              ? "1280 px"
              : "390 px"}
        </span>
      </header>
      <div ref={ref} className={"preview-stage " + mode}>
        <div
          className="preview-device"
          style={{
            width: width * scale,
            height:
              mode === "mobile"
                ? "calc(100dvh - 105px)"
                : "calc(100dvh - 77px)",
          }}
        >
          <iframe
            title="サイトプレビュー"
            src="/?embed=1"
            allow="camera; microphone"
            style={{
              width,
              height: `calc((100dvh - ${mode === "mobile" ? 105 : 77}px) / ${scale})`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Notebook({
  initialPosts = [],
  initialProfile,
  initialSelected = null,
}: {
  initialPosts?: Post[];
  initialProfile?: { name: string; icon: string; bio: string };
  initialSelected?: string | null;
}) {
  const inFlight = useRef(false);
  const guard = async (fn: () => Promise<void>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      await fn();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "操作に失敗しました。",
      );
      return false;
    } finally {
      inFlight.current = false;
    }
  };
  const refresh = async () => {
    setPosts(await api<Post[]>("posts"));
  };
  const logIn = async () => {
    const authenticated = await guard(async () => {
      await signIn();
      const saved = await api<Draft[]>("drafts");
      setDrafts(saved);
    });
    if (authenticated) setLogin(true);
  };
  const logOut = () =>
    guard(async () => {
      await api("auth/logout", "POST", {});
      setLogin(false);
      setDrafts([]);
      nav("home");
    });
  const [posts, setPosts] = useState<Post[]>(initialPosts),
    [profile, setProfile] = useState(
      initialProfile ?? {
        name: "かめさん",
        icon: "🐢",
        bio: "つくったものと日々の記録。",
      },
    ),
    [liked, setLiked] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [ready, setReady] = useState(false);
  const [login, setLogin] = useState(false),
    [view, setView] = useState<View>("home"),
    [filter, setFilter] = useState<"all" | Kind>("all"),
    [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState<"new" | "popular">("new"),
    [selected, setSelected] = useState<string | null>(initialSelected),
    [visibleTagCount, setVisibleTagCount] = useState(5);
  const [editor, setEditor] = useState(false),
    [kind, setKind] = useState<Kind>("tweet"),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [editId, setEditId] = useState<string | null>(null),
    [draftId, setDraftId] = useState<string | null>(null),
    [editorStart, setEditorStart] = useState(""),
    [blogEditorMode, setBlogEditorMode] = useState<BlogEditorMode>("edit"),
    [fullPageEditor, setFullPageEditor] = useState(false),
    [markdownHelpOpen, setMarkdownHelpOpen] = useState(false),
    [closeAsk, setCloseAsk] = useState(false),
    [draftList, setDraftList] = useState(false),
    [editorDrafts, setEditorDrafts] = useState(false),
    [inlineBody, setInlineBody] = useState(""),
    [editorImages, setEditorImages] = useState<string[]>([]),
    [inlineImages, setInlineImages] = useState<string[]>([]),
    [uploadingImages, setUploadingImages] = useState(false),
    [remove, setRemove] = useState<string | null>(null);
  const [name, setName] = useState(""),
    [bio, setBio] = useState(""),
    [icon, setIcon] = useState("");
  const [vMode, setVMode] = useState<"camera" | "upload">("camera"),
    [seconds, setSeconds] = useState(2),
    [clip, setClip] = useState(""),
    [caption, setCaption] = useState(""),
    [vtime, setVtime] = useState(""),
    [stream, setStream] = useState<MediaStream | null>(null),
    [recording, setRecording] = useState(false),
    [count, setCount] = useState(0),
    [cameraError, setCameraError] = useState("");
  const live = useRef<HTMLVideoElement>(null),
    bodyInput = useRef<HTMLTextAreaElement>(null),
    titleInput = useRef<HTMLInputElement>(null),
    rec = useRef<MediaRecorder | null>(null),
    clipData = useRef<Blob | null>(null),
    urls = useRef<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    api<{ authenticated: boolean }>("auth/session")
      .then(async (session) => {
        if (cancelled) return;
        setLogin(session.authenticated);
        if (session.authenticated) {
          const saved = await api<Draft[]>("drafts");
          if (!cancelled) setDrafts(saved);
        }
      })
      .catch(() => toast.error("接続できません。再読み込みしてください。"));
    try {
      const ls = JSON.parse(localStorage.getItem("kamelog-likes") || "[]");
      if (Array.isArray(ls))
        requestAnimationFrame(() => {
          setLiked(ls.filter((x) => typeof x === "string"));
          setReady(true);
        });
    } catch {
      requestAnimationFrame(() => setReady(true));
    }
    const objectUrls = urls.current;
    return () => {
      cancelled = true;
      objectUrls.forEach(URL.revokeObjectURL);
    };
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("kamelog-likes", JSON.stringify(liked));
      } catch {}
  }, [liked, ready]);
  useEffect(() => {
    if (live.current && stream) live.current.srcObject = stream;
  }, [stream, editor, kind, vMode]);
  useEffect(() => {
    const syncNavigation = () => {
      const post = postFromLocation();
      const state = readNavigationState();
      setView(post ? "home" : (state?.view ?? "home"));
      setSelected(post);
      if (post) setTag("");
    };
    const initialPost = postFromLocation();
    const initialState = readNavigationState();
    window.history.replaceState(
      navigationHistoryState({
        view: initialPost ? "home" : (initialState?.view ?? "home"),
        post: initialPost,
        internal: false,
      }),
      "",
      navigationUrl(initialPost),
    );
    syncNavigation();
    window.addEventListener("popstate", syncNavigation);
    return () => window.removeEventListener("popstate", syncNavigation);
  }, []);
  const nav = (v: View) => {
    const post = postFromLocation();
    const state = readNavigationState();
    if (post || (state?.view ?? "home") !== v) {
      window.history.pushState(
        navigationHistoryState({ view: v, post: null, internal: true }),
        "",
        navigationUrl(null),
      );
    }
    setView(v);
    setSelected(null);
    setTag("");
  };
  const openPost = (id: string) => {
    if (postFromLocation() !== id) {
      window.history.pushState(
        navigationHistoryState({ view: "home", post: id, internal: true }),
        "",
        navigationUrl(id),
      );
    }
    setView("home");
    setSelected(id);
    setTag("");
  };
  const closePost = () => {
    const post = postFromLocation();
    if (!post) {
      setSelected(null);
      return;
    }
    const state = readNavigationState();
    if (state?.internal && state.post === post) {
      window.history.back();
      return;
    }
    window.history.replaceState(
      navigationHistoryState({ view: "home", post: null, internal: false }),
      "",
      navigationUrl(null),
    );
    setView("home");
    setSelected(null);
    setTag("");
  };
  const replaceMarkdownSelection = (
    makeReplacement: (selected: string) => {
      value: string;
      selectionStart?: number;
      selectionLength?: number;
    },
  ) => {
    const input = bodyInput.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    const replacement = makeReplacement(body.slice(start, end));
    setBody(body.slice(0, start) + replacement.value + body.slice(end));
    requestAnimationFrame(() => {
      const selectionStart = start + (replacement.selectionStart ?? 0);
      const selectionEnd =
        selectionStart +
        (replacement.selectionLength ?? replacement.value.length);
      bodyInput.current?.focus();
      bodyInput.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  };
  const wrapMarkdown = (before: string, after: string, fallback: string) =>
    replaceMarkdownSelection((selected) => {
      const content = selected || fallback;
      return {
        value: before + content + after,
        selectionStart: before.length,
        selectionLength: content.length,
      };
    });
  const insertMarkdownBlock = (content: string) =>
    replaceMarkdownSelection(() => {
      const input = bodyInput.current;
      const start = input?.selectionStart ?? body.length;
      const end = input?.selectionEnd ?? body.length;
      const before = start > 0 && body[start - 1] !== "\n" ? "\n\n" : "";
      const after = end < body.length && body[end] !== "\n" ? "\n\n" : "";
      return { value: before + content + after, selectionStart: before.length };
    });
  const wrapMarkdownBlock = (before: string, after: string, fallback: string) =>
    replaceMarkdownSelection((selected) => {
      const input = bodyInput.current;
      const start = input?.selectionStart ?? body.length;
      const end = input?.selectionEnd ?? body.length;
      const leading = start > 0 && body[start - 1] !== "\n" ? "\n\n" : "";
      const trailing = end < body.length && body[end] !== "\n" ? "\n\n" : "";
      const content = selected || fallback;
      return {
        value: leading + before + content + after + trailing,
        selectionStart: leading.length + before.length,
        selectionLength: content.length,
      };
    });
  const prefixMarkdownLines = (
    prefix: string | ((index: number) => string),
    fallback: string,
  ) => {
    const input = bodyInput.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    const lineStart = body.lastIndexOf("\n", start - 1) + 1;
    const nextLineBreak = body.indexOf("\n", end);
    const lineEnd =
      start === end
        ? nextLineBreak === -1
          ? body.length
          : nextLineBreak
        : end;
    const original = body.slice(lineStart, lineEnd) || fallback;
    const content = original
      .split("\n")
      .map(
        (line, index) =>
          (typeof prefix === "string" ? prefix : prefix(index)) + line,
      )
      .join("\n");
    setBody(body.slice(0, lineStart) + content + body.slice(lineEnd));
    requestAnimationFrame(() => {
      bodyInput.current?.focus();
      bodyInput.current?.setSelectionRange(
        lineStart,
        lineStart + content.length,
      );
    });
  };
  const openEditor = (k: Kind = "tweet", p?: Post, d?: Draft) => {
    const t = p?.title ?? d?.title ?? "",
      b = p?.body ?? d?.body ?? "";
    setKind(k);
    setTitle(t);
    setBody(b);
    setEditorImages(p?.images ?? d?.images ?? []);
    setEditId(p?.id || null);
    setDraftId(d?.id || null);
    setEditorStart(
      JSON.stringify({ k, t, b, images: p?.images ?? d?.images ?? [] }),
    );
    setBlogEditorMode("edit");
    setFullPageEditor(false);
    setEditorDrafts(false);
    setEditor(true);
    if (k === "vlog") void prepareVlog();
  };
  useEffect(() => {
    if (!login || editor) return;
    const openWithN = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.toLowerCase() !== "n" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target?.matches("input, textarea, [contenteditable=true]") ||
        !window.matchMedia("(min-width: 641px)").matches
      )
        return;
      event.preventDefault();
      setKind("tweet");
      setTitle("");
      setBody("");
      setEditorImages([]);
      setEditId(null);
      setDraftId(null);
      setEditorStart(JSON.stringify({ k: "tweet", t: "", b: "", images: [] }));
      setBlogEditorMode("edit");
      setFullPageEditor(false);
      setEditorDrafts(false);
      setEditor(true);
    };
    window.addEventListener("keydown", openWithN);
    return () => window.removeEventListener("keydown", openWithN);
  }, [editor, login]);
  useEffect(() => {
    if (!editor || kind === "vlog" || blogEditorMode === "preview") return;
    requestAnimationFrame(() =>
      (kind === "blog" ? titleInput.current : bodyInput.current)?.focus(),
    );
  }, [editor, kind, blogEditorMode]);
  const dirty =
    JSON.stringify({ k: kind, t: title, b: body, images: editorImages }) !==
    editorStart;
  const askClose = () => {
    if (kind === "vlog") {
      closeComposer();
      return;
    }
    if (dirty && (title.trim() || body.trim() || editorImages.length))
      setCloseAsk(true);
    else setEditor(false);
  };
  const saveDraft = () =>
    guard(async () => {
      if (kind === "vlog") return;
      const old = drafts.find((d) => d.id === draftId);
      const saved = await api<Draft>(
        "drafts" + (draftId ? "/" + draftId : ""),
        draftId ? "PUT" : "POST",
        {
          kind,
          title,
          body,
          images: kind === "tweet" ? editorImages : [],
          ...(old ? { revision: old.revision } : {}),
        },
      );
      setDrafts((ds) => [saved, ...ds.filter((d) => d.id !== saved.id)]);
      setEditor(false);
      setCloseAsk(false);
      toast.success("下書きを保存しました");
    });
  const discard = () =>
    guard(async () => {
      if (draftId) {
        await api("drafts/" + draftId, "DELETE", undefined, {
          "If-Match": String(drafts.find((d) => d.id === draftId)?.revision),
        });
        setDrafts((ds) => ds.filter((d) => d.id !== draftId));
      }
      setEditor(false);
      setCloseAsk(false);
    });
  const publish = () =>
    guard(async () => {
      if (kind === "vlog") return;
      const old = posts.find((p) => p.id === editId);
      const saved = await api<Post>(
        "posts" + (editId ? "/" + editId : ""),
        editId ? "PUT" : "POST",
        {
          kind,
          title: title.trim(),
          body: body.trim(),
          tags: old?.tags || [],
          pinned: old?.pinned || false,
          images: kind === "tweet" ? editorImages : [],
          ...(old ? { revision: old.revision } : {}),
        },
      );
      setPosts((ps) => [saved, ...ps.filter((p) => p.id !== saved.id)]);
      setEditor(false);
      nav("timeline");
      setFilter("all");
      toast.success(editId ? "更新しました" : "投稿しました");
      if (draftId) {
        try {
          await api("drafts/" + draftId, "DELETE", undefined, {
            "If-Match": String(drafts.find((d) => d.id === draftId)?.revision),
          });
          setDrafts((ds) => ds.filter((d) => d.id !== draftId));
        } catch {
          toast.error("投稿済みです。下書きの削除だけ失敗しました。");
        }
      }
    });
  const publishInlineTweet = () => {
    const text = inlineBody.trim();
    if (!text && !inlineImages.length) return;
    void guard(async () => {
      const saved = await api<Post>("posts", "POST", {
        kind: "tweet",
        title: "",
        body: text,
        tags: [],
        pinned: false,
        images: inlineImages,
      });
      setPosts((ps) => [saved, ...ps]);
      setInlineBody("");
      setInlineImages([]);
      toast.success("投稿しました");
    });
  };
  const uploadImages = async (
    files: File[],
    target: "blog" | "blog-drop" | "tweet" | "inline",
  ) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    const current = target === "inline" ? inlineImages : editorImages;
    const allowed = target.startsWith("blog")
      ? images
      : images.slice(0, Math.max(0, 4 - current.length));
    if (!allowed.length) {
      toast.error(
        target.startsWith("blog")
          ? "画像ファイルを選んでください。"
          : "画像は最大4枚です。",
      );
      return;
    }
    setUploadingImages(true);
    try {
      const uploaded: { url: string }[] = [];
      for (const file of allowed) {
        const response = await fetch("/api/media?kind=image", {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "画像をアップロードできませんでした。",
          );
        uploaded.push(result);
      }
      if (target.startsWith("blog")) {
        const markdown = uploaded
          .map((image, index) => `![画像${index + 1}](${image.url})`)
          .join("\n\n");
        if (target === "blog-drop") insertMarkdownBlock(markdown);
        else
          setBody(
            (old) =>
              old + (old && !old.endsWith("\n") ? "\n\n" : "") + markdown,
          );
      } else if (target === "inline")
        setInlineImages((old) => [
          ...old,
          ...uploaded.map((image) => image.url),
        ]);
      else
        setEditorImages((old) => [
          ...old,
          ...uploaded.map((image) => image.url),
        ]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "画像をアップロードできませんでした。",
      );
    } finally {
      setUploadingImages(false);
    }
  };
  const droppedImages = (
    event: React.DragEvent,
    target: "blog" | "tweet" | "inline",
  ) => {
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!files.length) return;
    event.preventDefault();
    void uploadImages(files, target === "blog" ? "blog-drop" : target);
  };
  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };
  const prepareVlog = async () => {
    setVMode("camera");
    setClip("");
    clipData.current = null;
    setCaption("");
    setCameraError("");
    setVtime(
      new Date().toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    try {
      setStream(
        await navigator.mediaDevices.getUserMedia({
          video: { aspectRatio: 16 / 9, facingMode: { ideal: "environment" } },
          audio: true,
        }),
      );
    } catch {
      setCameraError("カメラを使えません。動画ファイルは選択できます。");
    }
  };
  const closeComposer = () => {
    if (recording) rec.current?.stop();
    stopCamera();
    setEditor(false);
  };
  const record = () => {
    if (!stream || recording) return;
    if (typeof MediaRecorder === "undefined") {
      setCameraError(
        "このブラウザでは直接撮影できません。動画ファイルを選んでください。",
      );
      return;
    }
    const chunks: BlobPart[] = [];
    const type = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : "video/webm";
    const r = new MediaRecorder(stream, { mimeType: type });
    rec.current = r;
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = () => {
      const blob = new Blob(chunks, { type });
      clipData.current = blob;
      const u = URL.createObjectURL(blob);
      urls.current.push(u);
      setClip(u);
      setRecording(false);
      setCount(0);
      stopCamera();
    };
    r.start();
    setRecording(true);
    setCount(seconds);
    let left = seconds;
    const timer = setInterval(() => {
      left--;
      setCount(left);
      if (left <= 0) {
        clearInterval(timer);
        if (r.state === "recording") r.stop();
      }
    }, 1000);
  };
  const choose = (f?: File) => {
    if (!f) return;
    clipData.current = f;
    const u = URL.createObjectURL(f);
    urls.current.push(u);
    setClip(u);
    stopCamera();
  };
  const postVlog = () =>
    guard(async () => {
      if (!clip || !clipData.current) return;
      const upload = await fetch("/api/media?seconds=" + seconds, {
        method: "POST",
        body: clipData.current,
      });
      const result = await upload.json();
      if (!upload.ok) throw new Error(result.error);
      const saved = await api<Post>("posts", "POST", {
        kind: "vlog",
        title: "",
        body: caption.trim(),
        time: vtime,
        tags: [],
        video: result.video,
      });
      setPosts((ps) => [saved, ...ps]);
      closeComposer();
      nav("timeline");
      setFilter("all");
      toast.success("vlogを投稿しました");
    });
  const shown = posts
    .filter(
      (p) =>
        (filter === "all" || p.kind === filter) &&
        (!tag || p.tags.includes(tag)) &&
        (!query ||
          (p.title + " " + p.body + " " + p.tags)
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "popular"
        ? b.likes - a.likes
        : +!!b.pinned - +!!a.pinned || b.date.localeCompare(a.date),
    );
  const tags = Object.entries(
    posts.reduce<Record<string, number>>((counts, post) => {
      for (const postTag of post.tags) {
        counts[postTag] = (counts[postTag] || 0) + 1;
      }
      return counts;
    }, {}),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
  const visibleTags = tags.slice(0, visibleTagCount);
  const featuredPost = [...posts].sort(
    (a, b) => b.likes - a.likes || b.date.localeCompare(a.date),
  )[0];
  const item = posts.find((p) => p.id === selected);
  const postUrl = (id: string) => {
    const url = new URL("/", location.origin);
    url.searchParams.set("post", id);
    return url.toString();
  };
  const meta = (p: Post) => (
    <div className="post-meta">
      <Avatar value={profile.icon} />
      <b>{profile.name}</b>
      <span>·</span>
      <time dateTime={p.date}>
        {new Date(p.date).toLocaleDateString("ja-JP", {
          month: "numeric",
          day: "numeric",
        })}
      </time>
      {p.kind === "blog" && p.updatedAt && (
        <>
          <span>·</span>
          <time dateTime={p.updatedAt} title="最終更新日">
            更新{" "}
            {new Date(p.updatedAt).toLocaleDateString("ja-JP", {
              month: "numeric",
              day: "numeric",
            })}
          </time>
        </>
      )}
      <span className={"type-label " + p.kind}>{label[p.kind]}</span>
    </div>
  );
  const actions = (p: Post) => (
    <div className="post-actions">
      <button
        className={liked.includes(p.id) ? "liked" : ""}
        onClick={() =>
          setLiked((ls) =>
            ls.includes(p.id) ? ls.filter((x) => x !== p.id) : [...ls, p.id],
          )
        }
      >
        <Heart
          size={17}
          fill={liked.includes(p.id) ? "currentColor" : "none"}
        />
        {p.likes + (liked.includes(p.id) ? 1 : 0)}
      </button>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(postUrl(p.id));
          toast.success("リンクをコピーしました");
        }}
      >
        <Share2 size={16} />
        リンクをコピー
      </button>
      <button
        onClick={() => {
          const intent = new URL("https://twitter.com/intent/tweet");
          intent.searchParams.set("url", postUrl(p.id));
          intent.searchParams.set("text", socialCopy(p));
          window.open(intent, "_blank", "noopener,noreferrer");
        }}
      >
        <X size={16} />
        Xで共有
      </button>
      {login && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="more">
              <MoreHorizontal size={19} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {p.kind !== "vlog" && (
              <DropdownMenuItem onClick={() => openEditor(p.kind, p)}>
                編集
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                guard(async () => {
                  await api("posts/" + p.id, "PUT", {
                    kind: p.kind,
                    title: p.title,
                    body: p.body,
                    tags: p.tags,
                    pinned: !p.pinned,
                    revision: p.revision,
                    ...(p.video ? { video: p.video, time: p.time } : {}),
                    images: p.images || [],
                  });
                  await refresh();
                })
              }
            >
              <Pin />
              固定
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => setRemove(p.id)}
            >
              <Trash2 />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
  return (
    <div className="notebook">
      <Toaster position="bottom-center" theme="light" />
      <div className="site-layout">
        <aside className="public-sidebar">
          <button className="site-name" onClick={() => nav("home")}>
            <strong>kamelog</strong>
            <ChevronDown size={15} />
          </button>
          <nav>
            <button
              className={view === "home" ? "active" : ""}
              onClick={() => nav("home")}
            >
              <Home />
              <span>ホーム</span>
            </button>
            <button
              className={view === "timeline" ? "active" : ""}
              onClick={() => nav("timeline")}
            >
              <MessageCircle />
              <span>タイムライン</span>
            </button>
            <button
              className={view === "projects" ? "active" : ""}
              onClick={() => nav("projects")}
            >
              <Globe />
              <span>プロジェクト</span>
            </button>
          </nav>
          <div className="sidebar-section">
            <span>コンテンツ</span>
            {(
              [
                { id: "blog", icon: FileText },
                { id: "tweet", icon: MessageCircle },
                { id: "vlog", icon: Video },
              ] as const
            ).map(({ id, icon: Icon }) => (
              <button
                key={id}
                className={filter === id ? "active" : ""}
                onClick={() => {
                  nav("timeline");
                  setFilter(id);
                }}
              >
                <Icon />
                <span>{label[id]}</span>
                <small>{posts.filter((p) => p.kind === id).length}</small>
              </button>
            ))}
          </div>
          <a
            className="side-link"
            href="https://github.com/kamesan1577"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 />
            <span>GitHub</span>
            <ArrowUpRight />
          </a>
          {login && (
            <div className="admin-nav">
              <Button
                variant="blue"
                size="sm"
                onClick={() => openEditor("tweet")}
              >
                <Plus />
                新規投稿
              </Button>
              <button
                onClick={() => {
                  nav("account");
                  setName(profile.name);
                  setBio(profile.bio);
                  setIcon(profile.icon);
                }}
              >
                <Avatar value={profile.icon} />
                <span>アカウント</span>
                <Settings />
              </button>
              <button onClick={logOut}>ログアウト</button>
            </div>
          )}
          <div className="sidebar-foot">
            {!login ? (
              <details className="admin-access">
                <summary>•••</summary>
                <button onClick={logIn}>ログイン</button>
              </details>
            ) : (
              <span>ログイン中</span>
            )}
            <small>© 2026 {profile.name}</small>
          </div>
        </aside>
        <div className="workspace">
          <header className="public-header">
            <button className="mobile-name" onClick={() => nav("home")}>
              <b>kamelog</b>
            </button>
            <span>
              {selected
                ? "投稿"
                : view === "projects"
                  ? "プロジェクト"
                  : view === "timeline"
                    ? "タイムライン"
                    : view === "account"
                      ? "アカウント"
                      : "ホーム"}
            </span>
            {!login ? (
              <details className="mobile-login">
                <summary>•••</summary>
                <button onClick={logIn}>ログイン</button>
              </details>
            ) : (
              <button
                className="mobile-account"
                onClick={() => {
                  nav("account");
                  setName(profile.name);
                  setBio(profile.bio);
                  setIcon(profile.icon);
                }}
              >
                管理
              </button>
            )}
          </header>
          <div
            className={
              "content-grid " + (view === "home" ? "landing-layout" : "")
            }
          >
            <main className="main-content">
              {view === "account" && login ? (
                <section className="settings-page">
                  <h1>アカウント</h1>
                  <div className="setting-avatar">
                    <Avatar value={icon || profile.icon} large />
                    <label className="upload-label">
                      <Upload size={15} />
                      画像を変更
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = new FileReader();
                          r.onload = () => setIcon(String(r.result));
                          r.readAsDataURL(f);
                        }}
                      />
                    </label>
                  </div>
                  <div className="emoji-options">
                    {["🐢", "🦦", "🐈", "🌱", "☕", "👾"].map((x) => (
                      <button key={x} onClick={() => setIcon(x)}>
                        {x}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    名前
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    自己紹介
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                    />
                  </label>
                  <Button
                    variant="blue"
                    onClick={() => {
                      if (!name.trim()) return;
                      void guard(async () => {
                        const saved = await api<typeof profile>(
                          "profile",
                          "PUT",
                          { name: name.trim(), bio, icon: icon || "🐢" },
                        );
                        setProfile(saved);
                        toast.success("保存しました");
                      });
                    }}
                  >
                    保存
                  </Button>
                </section>
              ) : view === "projects" ? (
                <section className="projects-page">
                  <h1>プロジェクト</h1>
                  <div className="project-grid">
                    <a
                      className="project-tile"
                      href="https://github.com/kamesan1577/kamelog"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src="/project-api.svg" alt="kamelogのサムネイル" />
                      <div>
                        <h2>
                          kamelog <ArrowUpRight size={16} />
                        </h2>
                        <p>ブログ・つぶやき・vlogをまとめる個人サイト</p>
                        <span>TypeScript</span>
                      </div>
                    </a>
                    <a
                      className="project-tile"
                      href="https://qiita.com/kamesan1577"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src="/project-tools.svg" alt="Qiitaのサムネイル" />
                      <div>
                        <h2>
                          Qiita <ArrowUpRight size={16} />
                        </h2>
                        <p>技術記事</p>
                        <span>Qiita</span>
                      </div>
                    </a>
                  </div>
                </section>
              ) : item ? (
                <section className="detail-page">
                  <button className="back-button" onClick={closePost}>
                    <ArrowLeft size={17} />
                    戻る
                  </button>
                  {meta(item)}
                  {item.kind === "blog" ? (
                    <Markdown
                      text={
                        item.body.startsWith("# ")
                          ? item.body
                          : "# " + item.title + "\n\n" + item.body
                      }
                    />
                  ) : item.kind === "vlog" ? (
                    <VlogFrame post={item} />
                  ) : (
                    <p className="tweet-body">{item.body}</p>
                  )}
                  {item.kind === "tweet" && (
                    <ImageGallery images={item.images} />
                  )}
                  <div className="tags">
                    {item.tags.map((t) => (
                      <Badge key={t} variant="gray">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  {actions(item)}
                </section>
              ) : view === "home" ? (
                <section className="landing-page">
                  <div className="landing-intro">
                    <div className="landing-copy">
                      <p className="landing-kicker">
                        <span aria-hidden="true" /> 個人の記録 / 公開中
                      </p>
                      <h1>
                        考えたことを、
                        <br />
                        散らかしたまま残す。
                      </h1>
                      <p className="landing-lead">
                        かめさんが書いたブログ、短いつぶやき、数秒のvlog、
                        作ったものを一つにまとめた個人サイトです。
                      </p>
                      <div className="landing-actions">
                        <button
                          className="landing-primary"
                          onClick={() => nav("timeline")}
                        >
                          タイムラインを見る
                          <ArrowUpRight size={16} />
                        </button>
                        <button onClick={() => nav("projects")}>
                          作ったもの
                        </button>
                      </div>
                    </div>
                    <aside className="landing-profile">
                      <Avatar value={profile.icon} large />
                      <div>
                        <span>このサイトを書いている人</span>
                        <h2>{profile.name}</h2>
                        <p>@kamesan1577 · Webバックエンドエンジニア</p>
                      </div>
                      <blockquote>{profile.bio}</blockquote>
                      <a
                        href="https://github.com/kamesan1577"
                        target="_blank"
                        rel="noreferrer"
                      >
                        GitHubでコードを見る <ArrowUpRight size={14} />
                      </a>
                    </aside>
                  </div>

                  <div className="landing-lower">
                    <div className="content-index">
                      <div className="landing-section-title">
                        <span>01</span>
                        <h2>ここにあるもの</h2>
                      </div>
                      <div className="content-cards">
                        {(
                          [
                            {
                              id: "blog",
                              icon: FileText,
                              title: "ブログ",
                              text: "技術と制作の過程を、あとから辿れる長さで。",
                            },
                            {
                              id: "tweet",
                              icon: MessageCircle,
                              title: "つぶやき",
                              text: "まとまる前の考えや、日々の小さな発見。",
                            },
                            {
                              id: "vlog",
                              icon: Video,
                              title: "vlog",
                              text: "その場の空気を残す、数秒の映像メモ。",
                            },
                          ] as const
                        ).map(({ id, icon: Icon, title: cardTitle, text }) => (
                          <button
                            key={id}
                            onClick={() => {
                              nav("timeline");
                              setFilter(id);
                            }}
                          >
                            <span className={`content-icon ${id}`}>
                              <Icon size={18} />
                            </span>
                            <span className="content-card-copy">
                              <strong>{cardTitle}</strong>
                              <small>{text}</small>
                            </span>
                            <b>{posts.filter((p) => p.kind === id).length}</b>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="featured-area">
                      <div className="landing-section-title">
                        <span>02</span>
                        <h2>いま読まれている</h2>
                      </div>
                      {featuredPost ? (
                        <button
                          className="featured-post"
                          onClick={() => openPost(featuredPost.id)}
                        >
                          <span className="featured-signal" aria-hidden="true">
                            <i />
                          </span>
                          <span className="featured-meta">
                            {label[featuredPost.kind]}
                            <span>·</span>
                            {new Date(featuredPost.date).toLocaleDateString(
                              "ja-JP",
                              { month: "numeric", day: "numeric" },
                            )}
                          </span>
                          <strong>
                            {featuredPost.kind === "blog"
                              ? featuredPost.title
                              : featuredPost.body || "映像の記録"}
                          </strong>
                          <span className="featured-open">
                            読む <ArrowUpRight size={14} />
                          </span>
                        </button>
                      ) : (
                        <div className="featured-empty">
                          最初の記録を準備しています。
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              ) : (
                <>
                  <section className="page-heading">
                    <h1>タイムライン</h1>
                  </section>
                  <label className="home-search mobile-search">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="投稿を検索"
                    />
                    {query && (
                      <button onClick={() => setQuery("")}>
                        <X size={15} />
                      </button>
                    )}
                  </label>
                  {login && (
                    <div className="composer desktop-composer">
                      <div className="composer-start">
                        <Avatar value={profile.icon} />
                        <textarea
                          className="inline-tweet"
                          value={inlineBody}
                          onChange={(event) =>
                            setInlineBody(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (
                              (event.ctrlKey || event.metaKey) &&
                              event.key === "Enter"
                            ) {
                              event.preventDefault();
                              publishInlineTweet();
                            }
                          }}
                          placeholder="いまどうしてる？"
                          maxLength={5000}
                          rows={1}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => droppedImages(event, "inline")}
                        />
                        <Button
                          variant="blue"
                          size="sm"
                          onClick={publishInlineTweet}
                          disabled={!inlineBody.trim() && !inlineImages.length}
                        >
                          投稿
                        </Button>
                      </div>
                      {inlineImages.length > 0 && (
                        <div className="composer-images">
                          <ImageGallery images={inlineImages} />
                          <button
                            type="button"
                            onClick={() => setInlineImages([])}
                          >
                            画像を取り消す
                          </button>
                        </div>
                      )}
                      <div className="composer-kinds">
                        <label className="image-upload-button">
                          <ImageIcon />
                          画像
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            multiple
                            disabled={
                              uploadingImages || inlineImages.length >= 4
                            }
                            onChange={(event) =>
                              void uploadImages(
                                Array.from(event.target.files || []),
                                "inline",
                              )
                            }
                          />
                        </label>
                        <button onClick={() => openEditor("blog")}>
                          <FileText />
                          ブログ
                        </button>
                        <button
                          onClick={() =>
                            document
                              .querySelector<HTMLTextAreaElement>(
                                ".inline-tweet",
                              )
                              ?.focus()
                          }
                        >
                          <MessageCircle />
                          つぶやき
                        </button>
                        <button onClick={() => openEditor("vlog")}>
                          <Video />
                          vlog
                        </button>
                        {drafts.length > 0 && (
                          <button
                            className="draft-button"
                            onClick={() => setDraftList(true)}
                          >
                            下書き {drafts.length}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="timeline-toolbar">
                    <Tabs
                      value={filter}
                      onValueChange={(v) => setFilter(v as "all" | Kind)}
                    >
                      <TabsList variant="line" className="feed-tabs">
                        <TabsTrigger value="all">すべて</TabsTrigger>
                        <TabsTrigger value="blog">ブログ</TabsTrigger>
                        <TabsTrigger value="tweet">つぶやき</TabsTrigger>
                        <TabsTrigger value="vlog">vlog</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="sort-button">
                          <SlidersHorizontal size={17} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSort("new")}>
                          新しい順 {sort === "new" && <Check />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSort("popular")}>
                          いいね順 {sort === "popular" && <Check />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {tag && (
                    <div className="filter-active">
                      #{tag}
                      <button onClick={() => setTag("")}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div className="feed">
                    {shown.map((p) => (
                      <article className={"post " + p.kind} key={p.id}>
                        {p.pinned && (
                          <div className="pinned">
                            <Pin size={12} />
                            固定
                          </div>
                        )}
                        {meta(p)}
                        {p.kind === "vlog" ? (
                          <div className="post-focus vlog-button">
                            <VlogFrame post={p} />
                            <button
                              className="open-vlog-detail"
                              onClick={() => openPost(p.id)}
                            >
                              詳細
                            </button>
                          </div>
                        ) : (
                          <button
                            className="post-focus"
                            onClick={() => openPost(p.id)}
                          >
                            {p.kind === "blog" ? (
                              <>
                                <h2>{p.title}</h2>
                                <p>
                                  {p.body
                                    .split("\n")
                                    .find((s) => s && !s.startsWith("#"))}
                                </p>
                              </>
                            ) : (
                              <p className="tweet-body">{p.body}</p>
                            )}
                          </button>
                        )}
                        {p.kind === "tweet" && (
                          <ImageGallery images={p.images} />
                        )}
                        {p.tags.length > 0 && (
                          <div className="tags">
                            {p.tags.map((t) => (
                              <button key={t} onClick={() => setTag(t)}>
                                <Badge variant={t === "Go" ? "blue" : "gray"}>
                                  {t}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {actions(p)}
                      </article>
                    ))}
                    {!shown.length && (
                      <div className="empty-state">
                        <p>該当する投稿はありません。</p>
                        <Button
                          onClick={() => {
                            setQuery("");
                            setFilter("all");
                            setTag("");
                          }}
                        >
                          解除
                        </Button>
                      </div>
                    )}
                    <div className="feed-count">{shown.length}件</div>
                  </div>
                </>
              )}
            </main>
            <aside
              className={
                "right-sidebar " + (view === "home" ? "landing-hidden" : "")
              }
            >
              <div className="profile-card">
                <Avatar value={profile.icon} large />
                <h2>{profile.name}</h2>
                <span className="profile-handle">@kamesan1577</span>
                <p>{profile.bio}</p>
                <a
                  href="https://github.com/kamesan1577"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                  <ArrowUpRight size={14} />
                </a>
              </div>
              <label className="side-search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="投稿を検索"
                />
                <kbd>/</kbd>
              </label>
              {tags.length > 0 && (
                <div className="aside-section">
                  <h3>タグ</h3>
                  <div className="topic-list">
                    {visibleTags.map(({ name, count }) => (
                      <button
                        key={name}
                        className={tag === name ? "active" : ""}
                        onClick={() => {
                          nav("timeline");
                          setTag(name);
                          setFilter("all");
                        }}
                      >
                        #{name}
                        <small>{count}</small>
                      </button>
                    ))}
                  </div>
                  {visibleTagCount < tags.length && (
                    <button
                      className="tag-load-more"
                      onClick={() => setVisibleTagCount((count) => count + 5)}
                    >
                      もっと見る
                    </button>
                  )}
                </div>
              )}
            </aside>
          </div>
          <nav className="mobile-nav">
            <button
              className={view === "home" ? "active" : ""}
              onClick={() => nav("home")}
            >
              <Home />
              <span>ホーム</span>
            </button>
            <button
              className={view === "timeline" ? "active" : ""}
              onClick={() => nav("timeline")}
            >
              <MessageCircle />
              <span>タイムライン</span>
            </button>
            <button
              className={view === "projects" ? "active" : ""}
              onClick={() => nav("projects")}
            >
              <Globe />
              <span>プロジェクト</span>
            </button>
          </nav>
          {login && (
            <button
              className="mobile-create"
              onClick={() => openEditor("tweet")}
              aria-label="投稿を作成"
            >
              <Plus size={23} />
            </button>
          )}
        </div>
      </div>
      <Dialog open={editor} onOpenChange={(o) => !o && askClose()}>
        <DialogContent
          className={
            "editor-dialog " +
            (kind === "vlog" ? "vlog-dialog " : "") +
            (kind === "blog" ? "blog-dialog " : "") +
            (kind === "blog" && fullPageEditor ? "is-full-page" : "")
          }
          onKeyDown={(event) => {
            if (
              kind !== "vlog" &&
              (event.ctrlKey || event.metaKey) &&
              event.key === "Enter"
            ) {
              event.preventDefault();
              void publish();
            }
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            askClose();
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            askClose();
          }}
        >
          <DialogTitle>
            {editId ? "投稿を編集" : draftId ? "下書きを編集" : "新規投稿"}
          </DialogTitle>
          <DialogDescription>
            {kind === "blog"
              ? "Markdownが使えます。"
              : kind === "tweet"
                ? "短文を入力します。"
                : "横長の短い動画を投稿します。"}
          </DialogDescription>
          {kind !== "vlog" && drafts.length > 0 && (
            <div className="editor-drafts">
              <button
                type="button"
                aria-expanded={editorDrafts}
                onClick={() => setEditorDrafts((open) => !open)}
              >
                下書きから貼り付け
                <span>{drafts.length}</span>
              </button>
              {editorDrafts && (
                <div className="draft-list">
                  {drafts.map((draft) => (
                    <button
                      type="button"
                      key={draft.id}
                      onClick={() => {
                        setKind(draft.kind);
                        setTitle(draft.title);
                        setBody(draft.body);
                        setEditorImages(draft.images || []);
                        setEditId(null);
                        setDraftId(draft.id);
                        setEditorStart(
                          JSON.stringify({
                            k: draft.kind,
                            t: draft.title,
                            b: draft.body,
                            images: draft.images || [],
                          }),
                        );
                        setEditorDrafts(false);
                      }}
                    >
                      <b>{draft.title || draft.body.slice(0, 36) || "無題"}</b>
                      <span>{label[draft.kind]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Tabs
            value={kind}
            onValueChange={(v) => {
              const next = v as Kind;
              if (next === "vlog") {
                setKind(next);
                void prepareVlog();
              } else {
                stopCamera();
                setClip("");
                clipData.current = null;
                setCaption("");
                setKind(next);
              }
            }}
          >
            <TabsList className="editor-kinds">
              <TabsTrigger value="blog">
                <FileText />
                ブログ
              </TabsTrigger>
              <TabsTrigger value="tweet">
                <MessageCircle />
                つぶやき
              </TabsTrigger>
              <TabsTrigger value="vlog">
                <Video />
                vlog
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {kind === "vlog" ? (
            <>
              <Tabs
                value={vMode}
                onValueChange={(v) => {
                  setVMode(v as "camera" | "upload");
                  if (v === "upload") stopCamera();
                  else if (!stream && !clip) void prepareVlog();
                }}
              >
                <TabsList className="vlog-tabs">
                  <TabsTrigger value="camera">今撮る</TabsTrigger>
                  <TabsTrigger value="upload">動画を選ぶ</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="vlog-stage">
                {clip ? (
                  <video src={clip} controls playsInline />
                ) : vMode === "camera" ? (
                  <video ref={live} autoPlay muted playsInline />
                ) : (
                  <label className="select-video">
                    <Upload />
                    動画を選ぶ
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => choose(e.target.files?.[0])}
                    />
                  </label>
                )}
                <div className="vlog-overlay">
                  <time>{vtime}</time>
                  {caption && <p>{caption}</p>}
                </div>
                {recording && (
                  <div className="recording-mark">
                    <span />
                    REC · {count}
                  </div>
                )}
              </div>
              {cameraError && <p className="camera-error">{cameraError}</p>}
              {!clip && vMode === "camera" && (
                <>
                  <div className="duration-picker">
                    {[2, 5, 10, 30].map((s) => (
                      <button
                        className={seconds === s ? "active" : ""}
                        onClick={() => setSeconds(s)}
                        key={s}
                      >
                        {s}秒
                      </button>
                    ))}
                  </div>
                  <button
                    className="record-button"
                    onClick={record}
                    disabled={!stream || recording}
                  >
                    <span />
                  </button>
                </>
              )}
              {clip && (
                <>
                  <label className="caption-field">
                    キャプション
                    <input
                      maxLength={60}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="一文だけ（任意）"
                    />
                  </label>
                  <div className="vlog-actions">
                    <Button
                      onClick={() => {
                        setClip("");
                        clipData.current = null;
                        setCaption("");
                        if (vMode === "camera") void prepareVlog();
                      }}
                    >
                      やり直す
                    </Button>
                    <Button variant="blue" onClick={postVlog}>
                      投稿する
                    </Button>
                  </div>
                </>
              )}
              {!clip && vMode === "upload" && (
                <p className="crop-note">公開時は16:9で中央を切り抜きます。</p>
              )}
            </>
          ) : (
            <>
              {kind === "blog" && (
                <input
                  ref={titleInput}
                  className="title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="タイトル"
                />
              )}
              {kind === "blog" && (
                <div
                  className="editor-tools"
                  role="toolbar"
                  aria-label="Markdown記法"
                >
                  <div className="editor-tool-list">
                    <button
                      type="button"
                      aria-label="見出し"
                      onClick={() => prefixMarkdownLines("## ", "見出し")}
                    >
                      見出し
                    </button>
                    <button
                      type="button"
                      aria-label="太字"
                      onClick={() => wrapMarkdown("**", "**", "太字")}
                    >
                      太字
                    </button>
                    <button
                      type="button"
                      aria-label="斜体"
                      onClick={() => wrapMarkdown("_", "_", "斜体")}
                    >
                      斜体
                    </button>
                    <button
                      type="button"
                      aria-label="取り消し線"
                      onClick={() => wrapMarkdown("~~", "~~", "取り消し")}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      aria-label="引用"
                      onClick={() => prefixMarkdownLines("> ", "引用文")}
                    >
                      引用
                    </button>
                    <button
                      type="button"
                      aria-label="箇条書き"
                      onClick={() => prefixMarkdownLines("- ", "項目")}
                    >
                      ・リスト
                    </button>
                    <button
                      type="button"
                      aria-label="番号付きリスト"
                      onClick={() =>
                        prefixMarkdownLines((index) => `${index + 1}. `, "項目")
                      }
                    >
                      1. リスト
                    </button>
                    <button
                      type="button"
                      aria-label="チェックリスト"
                      onClick={() => prefixMarkdownLines("- [ ] ", "項目")}
                    >
                      ☑ リスト
                    </button>
                    <button
                      type="button"
                      aria-label="リンク"
                      onClick={() =>
                        wrapMarkdown("[", "](https://example.com)", "リンク")
                      }
                    >
                      リンク
                    </button>
                    <button
                      type="button"
                      aria-label="画像"
                      onClick={() =>
                        wrapMarkdown(
                          "![",
                          "](https://example.com/image.png)",
                          "代替テキスト",
                        )
                      }
                    >
                      画像
                    </button>
                    <button
                      type="button"
                      aria-label="インラインコード"
                      onClick={() => wrapMarkdown("`", "`", "code")}
                    >
                      `code`
                    </button>
                    <button
                      type="button"
                      aria-label="コードブロック"
                      onClick={() =>
                        wrapMarkdownBlock(
                          "```javascript\n",
                          "\n```",
                          "const answer = 42;",
                        )
                      }
                    >
                      コード
                    </button>
                    <button
                      type="button"
                      aria-label="表"
                      onClick={() =>
                        insertMarkdownBlock(
                          "| 列1 | 列2 |\n| --- | --- |\n| 値1 | 値2 |",
                        )
                      }
                    >
                      表
                    </button>
                    <button
                      type="button"
                      aria-label="区切り線"
                      onClick={() => insertMarkdownBlock("---")}
                    >
                      区切り
                    </button>
                  </div>
                  <button
                    type="button"
                    className="markdown-help-link"
                    aria-label="Markdownヘルプ"
                    onClick={() => setMarkdownHelpOpen(true)}
                  >
                    ヘルプ
                  </button>
                  <div
                    className="editor-view-modes"
                    role="group"
                    aria-label="エディタ表示"
                  >
                    <button
                      type="button"
                      className={blogEditorMode === "edit" ? "active" : ""}
                      aria-pressed={blogEditorMode === "edit"}
                      onClick={() => setBlogEditorMode("edit")}
                    >
                      <Pencil size={14} />
                      編集
                    </button>
                    <button
                      type="button"
                      className={blogEditorMode === "preview" ? "active" : ""}
                      aria-pressed={blogEditorMode === "preview"}
                      onClick={() => setBlogEditorMode("preview")}
                    >
                      <Eye size={14} />
                      プレビュー
                    </button>
                    <button
                      type="button"
                      className={blogEditorMode === "split" ? "active" : ""}
                      aria-pressed={blogEditorMode === "split"}
                      onClick={() => {
                        setBlogEditorMode("split");
                        setFullPageEditor(true);
                      }}
                    >
                      <Columns2 size={14} />
                      両方
                    </button>
                  </div>
                  <button
                    type="button"
                    className="full-page-toggle"
                    aria-label={
                      fullPageEditor ? "モーダル表示に戻す" : "フルページで編集"
                    }
                    onClick={() => {
                      if (fullPageEditor && blogEditorMode === "split")
                        setBlogEditorMode("edit");
                      setFullPageEditor((value) => !value);
                    }}
                  >
                    {fullPageEditor ? (
                      <Minimize2 size={15} />
                    ) : (
                      <Maximize2 size={15} />
                    )}
                  </button>
                </div>
              )}
              {kind === "blog" ? (
                <div className={"blog-editor-workspace mode-" + blogEditorMode}>
                  {blogEditorMode !== "preview" && (
                    <textarea
                      ref={bodyInput}
                      className="body-input blog"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="本文"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => droppedImages(event, "blog")}
                    />
                  )}
                  {blogEditorMode !== "edit" && (
                    <div className="editor-preview" aria-label="プレビュー">
                      <Markdown text={"# " + title + "\n\n" + body} />
                    </div>
                  )}
                </div>
              ) : (
                <textarea
                  ref={bodyInput}
                  className="body-input tweet"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="本文"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => droppedImages(event, "tweet")}
                />
              )}
              <div className="editor-media-row">
                <label className="image-upload-button">
                  <ImageIcon />
                  {kind === "blog"
                    ? "画像を本文末尾へ追加"
                    : `画像を追加（${editorImages.length}/4）`}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple={kind === "tweet"}
                    disabled={
                      uploadingImages ||
                      (kind === "tweet" && editorImages.length >= 4)
                    }
                    onChange={(event) =>
                      void uploadImages(
                        Array.from(event.target.files || []),
                        kind === "blog" ? "blog" : "tweet",
                      )
                    }
                  />
                </label>
                {uploadingImages && <span>アップロード中…</span>}
              </div>
              {kind === "tweet" && editorImages.length > 0 && (
                <div className="composer-images">
                  <ImageGallery images={editorImages} />
                  <button type="button" onClick={() => setEditorImages([])}>
                    画像を取り消す
                  </button>
                </div>
              )}
              <div className="editor-footer">
                <span>{body.length}文字</span>
                <Button onClick={askClose}>閉じる</Button>
                <Button variant="blue" onClick={publish}>
                  投稿
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={markdownHelpOpen} onOpenChange={setMarkdownHelpOpen}>
        <DialogContent className="markdown-help-dialog">
          <DialogTitle>Markdown記法ヘルプ</DialogTitle>
          <DialogDescription>
            ブログで使えるCommonMarkとGFMの記法です。生HTMLは表示されません。
          </DialogDescription>
          <div className="markdown-help-list">
            {markdownHelp.map(([name, description, syntax]) => (
              <section key={name}>
                <h3>{name}</h3>
                <p>{description}</p>
                <pre>
                  <code>{syntax}</code>
                </pre>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={closeAsk} onOpenChange={setCloseAsk}>
        <DialogContent>
          <DialogTitle>この投稿を保存しますか？</DialogTitle>
          <DialogDescription>
            保存しない場合、入力内容は削除されます。
          </DialogDescription>
          <div className="confirm-actions">
            <Button onClick={() => setCloseAsk(false)}>編集を続ける</Button>
            <Button onClick={discard}>削除して閉じる</Button>
            <Button variant="blue" onClick={saveDraft}>
              下書き保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={draftList} onOpenChange={setDraftList}>
        <DialogContent>
          <DialogTitle>下書き</DialogTitle>
          <DialogDescription>サーバーに保存されています。</DialogDescription>
          <div className="draft-list">
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setDraftList(false);
                  openEditor(d.kind, undefined, d);
                }}
              >
                <b>{d.title || d.body.slice(0, 36) || "無題"}</b>
                <span>
                  {label[d.kind]} ·{" "}
                  {new Date(d.savedAt).toLocaleString("ja-JP", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => !open && setRemove(null)}
      >
        <AlertDialogContent className="delete-dialog">
          <AlertDialogTitle>投稿を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            公開サイトから削除されます。
          </AlertDialogDescription>
          <AlertDialogFooter className="confirm-actions">
            <Button onClick={() => setRemove(null)}>キャンセル</Button>
            <Button
              variant="red-fill"
              onClick={() => {
                void guard(async () => {
                  await api("posts/" + remove, "DELETE", undefined, {
                    "If-Match": String(
                      posts.find((p) => p.id === remove)?.revision,
                    ),
                  });
                  setPosts((ps) => ps.filter((p) => p.id !== remove));
                  setRemove(null);
                });
              }}
            >
              削除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function VlogFrame({ post }: { post: Post }) {
  const video = useRef<HTMLVideoElement>(null);
  const [looping, setLooping] = useState(false);
  const startShortLoop = () => {
    const element = video.current;
    if (!element || !shouldAutoplayVlog(element.duration)) return;
    element.muted = true;
    element.loop = true;
    setLooping(true);
    void element.play().catch(() => undefined);
  };
  return (
    <div className="vlog-frame">
      {post.video ? (
        <video
          ref={video}
          src={post.video}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={startShortLoop}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="missing-video">
          <Video />
          動画なし
        </div>
      )}
      <div className="vlog-overlay">
        <time>
          {post.time ||
            new Date(post.date).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
        </time>
        {post.body && <p>{post.body}</p>}
      </div>
      {post.video && looping && (
        <button
          type="button"
          className="vlog-loop-toggle"
          onClick={(event) => {
            event.stopPropagation();
            if (video.current) video.current.loop = false;
            setLooping(false);
          }}
        >
          ループ再生を停止
        </button>
      )}
    </div>
  );
}
