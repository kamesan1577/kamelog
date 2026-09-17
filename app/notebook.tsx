"use client";
import {
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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
  RefreshCw,
  Search,
  Settings,
  Share2,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/notion/button";
import { SideNavigation } from "@/components/design-system/patterns/SideNavigation";
import { MobileNavigation } from "@/components/design-system/patterns/MobileNavigation";
import { PageHeader } from "@/components/design-system/patterns/PageHeader";
import { ContentIndex } from "@/components/design-system/patterns/ContentIndex";
import { TimelineToolbar } from "@/components/design-system/patterns/TimelineToolbar";
import { PostMeta } from "@/components/design-system/patterns/PostMeta";
import { PostPreview } from "@/components/design-system/patterns/PostPreview";
import { TimelineItem } from "@/components/design-system/patterns/TimelineItem";
import { InlineComposer } from "@/components/design-system/patterns/InlineComposer";
import { BlogEditorToolbar } from "@/components/design-system/patterns/BlogEditorToolbar";
import { BlogEditorWorkspace } from "@/components/design-system/patterns/BlogEditorWorkspace";
import { EditorFooter } from "@/components/design-system/patterns/EditorFooter";
import { MediaGallery } from "@/components/design-system/patterns/MediaGallery";
import { PostActions } from "@/components/design-system/patterns/PostActions";
import { MediaUploadField } from "@/components/design-system/patterns/MediaUploadField";
import { TagList } from "@/components/design-system/patterns/TagList";
import { ProjectList } from "@/components/design-system/patterns/ProjectList";
import { OwnerSection } from "@/components/design-system/patterns/OwnerSection";
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
import { buildXIntentUrl } from "@/lib/x-intent.mjs";
import threadStyles from "./tweet-thread-bridge.module.css";
import {
  EngineeringProfile,
  ContactLinks,
} from "@/components/engineering-profile";
import { contact, projects } from "@/lib/public-profile";
import "./landing.css";
import "./engineering.css";

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
  federationUpdatedAt?: string;
  tags: string[];
  autoTags?: {
    tag: string;
    confidence: number;
    modelVersion: string;
    contentHash: string;
  }[];
  likes: number;
  views?: number;
  video?: string;
  time?: string;
  pinned?: boolean;
  images?: string[];
  federationEnabled?: boolean;
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
type FederationStatus =
  | { enabled: false; host: string }
  | {
      enabled: true;
      host: string;
      username: string;
      handle: string;
      actorUrl: string;
    };
type FederationFollowing = {
  actorId: string;
  handle: string | null;
  preferredUsername: string;
  displayName: string;
  state: "pending" | "accepted" | "rejected" | "failed";
  updatedAt: string;
  lastError: string | null;
};
type FederationTimelineItem = {
  id: string;
  source: "remote" | "self";
  activityType: "Create" | "Announce";
  actorId: string;
  displayName: string;
  handle: string;
  objectId: string;
  contentHtml: string;
  url: string;
  publishedAt: string;
  updatedAt?: string;
  activityPublishedAt: string;
  attachments: { type: string; url: string }[];
  reposted?: boolean;
};
type FederationTimelineResponse = {
  items: FederationTimelineItem[];
  nextCursor: string | null;
};
type PublicRepost = {
  id: string;
  kind: "repost";
  objectId: string;
  displayName: string;
  handle: string;
  contentHtml: string;
  url: string;
  date: string;
  publishedAt: string;
  likes: number;
  attachments: { type: string; url: string }[];
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
    <div data-ds="detail-markdown" className="markdown">
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
  return (
    <MediaGallery
      images={images}
      gridClassName={"image-grid count-" + images.length}
    />
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
  initialReposts = [],
  initialProfile,
  initialSelected = null,
}: {
  initialPosts?: Post[];
  initialReposts?: PublicRepost[];
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
    const [nextPosts, nextReposts] = await Promise.all([
      api<Post[]>("posts"),
      api<PublicRepost[]>("federation/reposts"),
    ]);
    setPosts(nextPosts);
    setPublicReposts(nextReposts);
  };
  const logIn = async () => {
    const authenticated = await guard(async () => {
      await signIn();
      const saved = await api<Draft[]>("drafts");
      setDrafts(saved);
      await loadFederationStatus();
    });
    if (authenticated) setLogin(true);
  };
  const logOut = () =>
    guard(async () => {
      await api("auth/logout", "POST", {});
      setLogin(false);
      setDrafts([]);
      setTimelineMode("kamelog");
      setFederationTimeline([]);
      nav("home");
    });
  const [posts, setPosts] = useState<Post[]>(initialPosts),
    [publicReposts, setPublicReposts] =
      useState<PublicRepost[]>(initialReposts),
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
    [editorFederationEnabled, setEditorFederationEnabled] = useState(true),
    [inlineFederationEnabled, setInlineFederationEnabled] = useState(true),
    [xIntent, setXIntent] = useState<Record<Kind, boolean>>({
      blog: true,
      tweet: true,
      vlog: false,
    }),
    [xFallback, setXFallback] = useState<string | null>(null),
    [uploadingImages, setUploadingImages] = useState(false),
    [remove, setRemove] = useState<string | null>(null);
  const [name, setName] = useState(""),
    [bio, setBio] = useState(""),
    [icon, setIcon] = useState("");
  const [federationStatus, setFederationStatus] =
      useState<FederationStatus | null>(null),
    [federationUsername, setFederationUsername] = useState(""),
    [federationError, setFederationError] = useState(""),
    [federationBusy, setFederationBusy] = useState(false),
    [federationLoadError, setFederationLoadError] = useState(false),
    [federationFollowing, setFederationFollowing] = useState<
      FederationFollowing[]
    >([]),
    [federationFollowHandle, setFederationFollowHandle] = useState(""),
    [federationFollowError, setFederationFollowError] = useState(""),
    [federationFollowBusy, setFederationFollowBusy] = useState(false),
    [timelineMode, setTimelineMode] = useState<"kamelog" | "fediverse">(
      "kamelog",
    ),
    [federationTimeline, setFederationTimeline] = useState<
      FederationTimelineItem[]
    >([]),
    [federationTimelineCursor, setFederationTimelineCursor] = useState<
      string | null
    >(null),
    [federationTimelineBusy, setFederationTimelineBusy] = useState(false),
    [federationTimelineError, setFederationTimelineError] = useState(""),
    [federationRepostBusy, setFederationRepostBusy] = useState<string | null>(
      null,
    );
  const loadFederationFollowing = useCallback(async () => {
    const following = await api<FederationFollowing[]>("federation/following");
    setFederationFollowing(following);
  }, []);
  const loadFederationStatus = useCallback(async () => {
    try {
      const status = await api<FederationStatus>("federation/status");
      setFederationStatus(status);
      setFederationLoadError(false);
      if (status.enabled)
        try {
          await loadFederationFollowing();
        } catch {
          setFederationFollowError(
            "フォロー一覧を読み込めませんでした。再読み込みしてください。",
          );
        }
      else setFederationFollowing([]);
    } catch {
      setFederationLoadError(true);
    }
  }, [loadFederationFollowing]);
  const federationFollow = async () => {
    const handle = federationFollowHandle.trim();
    if (!/^@?[^@\s]+@[^@\s]+$/.test(handle)) {
      setFederationFollowError(
        "@ユーザー名@サーバー名の形式で入力してください。",
      );
      return;
    }
    setFederationFollowBusy(true);
    setFederationFollowError("");
    try {
      await api("federation/follow", "POST", { handle });
      setFederationFollowHandle("");
      await loadFederationFollowing();
      toast.success("フォローリクエストを送信しました");
    } catch (error) {
      setFederationFollowError(
        error instanceof Error ? error.message : "フォローできませんでした。",
      );
    } finally {
      setFederationFollowBusy(false);
    }
  };
  const federationUnfollow = async (actorId: string) => {
    setFederationFollowBusy(true);
    setFederationFollowError("");
    try {
      await api("federation/follow", "DELETE", { actorId });
      await loadFederationFollowing();
      toast.success("フォローを解除しました");
    } catch (error) {
      setFederationFollowError(
        error instanceof Error
          ? error.message
          : "フォローを解除できませんでした。",
      );
    } finally {
      setFederationFollowBusy(false);
    }
  };
  const loadFederationTimeline = async (
    cursor: string | null = null,
    append = false,
  ) => {
    setFederationTimelineBusy(true);
    setFederationTimelineError("");
    try {
      const result = await api<FederationTimelineResponse>(
        `federation/timeline${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setFederationTimeline((current) =>
        append ? [...current, ...result.items] : result.items,
      );
      setFederationTimelineCursor(result.nextCursor);
    } catch (error) {
      setFederationTimelineError(
        error instanceof Error
          ? error.message
          : "Fediverseを読み込めませんでした。",
      );
    } finally {
      setFederationTimelineBusy(false);
    }
  };
  const federationRepost = async (timelineItem: FederationTimelineItem) => {
    setFederationRepostBusy(timelineItem.objectId);
    try {
      if (timelineItem.reposted) {
        await api(
          `federation/reposts/${encodeURIComponent(timelineItem.objectId)}`,
          "DELETE",
          {},
        );
        setPublicReposts((current) =>
          current.filter((repost) => repost.objectId !== timelineItem.objectId),
        );
        setFederationTimeline((current) =>
          current.map((item) =>
            item.objectId === timelineItem.objectId
              ? { ...item, reposted: false }
              : item,
          ),
        );
        toast.success("RPを取り消しました");
      } else {
        const repost = await api<PublicRepost>("federation/reposts", "POST", {
          objectId: timelineItem.objectId,
        });
        setPublicReposts((current) => [
          repost,
          ...current.filter((item) => item.objectId !== repost.objectId),
        ]);
        setFederationTimeline((current) =>
          current.map((item) =>
            item.objectId === timelineItem.objectId
              ? { ...item, reposted: true }
              : item,
          ),
        );
        toast.success("RPしました");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "RPを更新できませんでした。",
      );
    } finally {
      setFederationRepostBusy(null);
    }
  };
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
    const stored = {
      blog:
        localStorage.getItem("kamelog:x-intent:blog") === null
          ? true
          : localStorage.getItem("kamelog:x-intent:blog") === "true",
      tweet:
        localStorage.getItem("kamelog:x-intent:tweet") === null
          ? true
          : localStorage.getItem("kamelog:x-intent:tweet") === "true",
      vlog:
        localStorage.getItem("kamelog:x-intent:vlog") === null
          ? false
          : localStorage.getItem("kamelog:x-intent:vlog") === "true",
    };
    queueMicrotask(() => setXIntent(stored));
  }, []);
  const toggleXIntent = (target: Kind) => {
    const next = !xIntent[target];
    setXIntent((current) => ({ ...current, [target]: next }));
    try {
      localStorage.setItem(`kamelog:x-intent:${target}`, String(next));
    } catch {
      /* Browser storage may be disabled. */
    }
  };
  const prepareX = (target: Kind) => {
    if (!xIntent[target]) return null;
    setXFallback(null);
    try {
      const popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
      return popup;
    } catch {
      return null;
    }
  };
  const completeX = (post: Post, popup: Window | null) => {
    if (!xIntent[post.kind]) return;
    const url = new URL("/", window.location.origin);
    url.searchParams.set("post", post.id);
    const intent = buildXIntentUrl(post, url.toString());
    try {
      if (popup && !popup.closed) {
        popup.location.href = intent;
        return;
      }
    } catch {
      /* Show the manual action when the tab is unavailable. */
    }
    setXFallback(intent);
  };
  const xToggle = (target: Kind) => (
    <label className="x-intent-toggle">
      <span>Xにも投稿</span>
      <input
        type="checkbox"
        role="switch"
        checked={xIntent[target]}
        onChange={() => toggleXIntent(target)}
      />
      <span className="x-intent-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
  const federationToggle = (
    target: Kind,
    checked: boolean,
    setChecked: (value: boolean) => void,
  ) =>
    federationStatus?.enabled && target !== "vlog" ? (
      <label className="x-intent-toggle federation-post-toggle">
        <span>Fediverseにも配信</span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <span className="x-intent-track" aria-hidden="true">
          <span />
        </span>
      </label>
    ) : null;
  const xFallbackAction = xFallback && (
    <a
      className="x-intent-fallback"
      href={xFallback}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => setXFallback(null)}
    >
      Xで開く
    </a>
  );
  useEffect(() => {
    let cancelled = false;
    api<{ authenticated: boolean }>("auth/session")
      .then(async (session) => {
        if (cancelled) return;
        setLogin(session.authenticated);
        if (session.authenticated) {
          const saved = await api<Draft[]>("drafts");
          if (!cancelled) {
            setDrafts(saved);
            await loadFederationStatus();
          }
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
  }, [loadFederationStatus]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("kamelog-likes", JSON.stringify(liked));
      } catch {}
  }, [liked, ready]);
  useEffect(() => {
    if (!selected) return;
    const key = `kamelog-viewed:${selected}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    void api<Post>(`posts/${selected}/view`, "POST", {})
      .then((viewed) =>
        setPosts((current) =>
          current.map((post) => (post.id === viewed.id ? viewed : post)),
        ),
      )
      .catch(() => {
        try {
          sessionStorage.removeItem(key);
        } catch {}
      });
  }, [selected]);
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
    setEditorFederationEnabled(p ? p.federationEnabled === true : true);
    setEditId(p?.id || null);
    setDraftId(d?.id || null);
    setEditorStart(
      JSON.stringify({
        k,
        t,
        b,
        images: p?.images ?? d?.images ?? [],
        federation: p ? p.federationEnabled === true : true,
      }),
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
      setEditorFederationEnabled(true);
      setEditId(null);
      setDraftId(null);
      setEditorStart(
        JSON.stringify({
          k: "tweet",
          t: "",
          b: "",
          images: [],
          federation: true,
        }),
      );
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
    JSON.stringify({
      k: kind,
      t: title,
      b: body,
      images: editorImages,
      federation: editorFederationEnabled,
    }) !== editorStart;
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
  const publish = () => {
    if (inFlight.current || kind === "vlog") return;
    const popup = !editId ? prepareX(kind) : null;
    return guard(async () => {
      try {
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
            federationEnabled: editorFederationEnabled,
            ...(old ? { revision: old.revision } : {}),
          },
        );
        setPosts((ps) => [saved, ...ps.filter((p) => p.id !== saved.id)]);
        setEditor(false);
        nav("timeline");
        setFilter("all");
        toast.success(editId ? "更新しました" : "投稿しました");
        if (!editId) completeX(saved, popup);
        if (draftId) {
          try {
            await api("drafts/" + draftId, "DELETE", undefined, {
              "If-Match": String(
                drafts.find((d) => d.id === draftId)?.revision,
              ),
            });
            setDrafts((ds) => ds.filter((d) => d.id !== draftId));
          } catch {
            toast.error("投稿済みです。下書きの削除だけ失敗しました。");
          }
        }
      } catch (error) {
        popup?.close();
        throw error;
      }
    });
  };
  const publishInlineTweet = () => {
    if (inFlight.current) return;
    const text = inlineBody.trim();
    if (!text && !inlineImages.length) return;
    const popup = prepareX("tweet");
    void guard(async () => {
      try {
        const saved = await api<Post>("posts", "POST", {
          kind: "tweet",
          title: "",
          body: text,
          tags: [],
          pinned: false,
          images: inlineImages,
          federationEnabled: inlineFederationEnabled,
        });
        setPosts((ps) => [saved, ...ps]);
        setInlineBody("");
        setInlineImages([]);
        toast.success("投稿しました");
        completeX(saved, popup);
      } catch (error) {
        popup?.close();
        throw error;
      }
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
  const postVlog = () => {
    if (inFlight.current || !clip || !clipData.current) return;
    const popup = prepareX("vlog");
    return guard(async () => {
      try {
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
        completeX(saved, popup);
      } catch (error) {
        popup?.close();
        throw error;
      }
    });
  };
  const shownPosts = posts.filter(
    (p) =>
      (filter === "all" || p.kind === filter) &&
      (!tag || p.tags.includes(tag)) &&
      (!query ||
        (p.title + " " + p.body + " " + p.tags)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const shownReposts =
    filter === "all" && !tag
      ? publicReposts.filter(
          (repost) =>
            !query ||
            (
              repost.displayName +
              " " +
              repost.handle +
              " " +
              repost.contentHtml.replace(/<[^>]+>/g, " ")
            )
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
      : [];
  const shown = [...shownPosts, ...shownReposts].sort((a, b) =>
    sort === "popular"
      ? b.likes - a.likes
      : +(b.kind !== "repost" && !!b.pinned) -
          +(a.kind !== "repost" && !!a.pinned) || b.date.localeCompare(a.date),
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
    (a, b) => (b.views ?? 0) - (a.views ?? 0) || b.date.localeCompare(a.date),
  )[0];
  const item = posts.find((p) => p.id === selected);
  const postUrl = (id: string) => {
    const url = new URL("/", location.origin);
    url.searchParams.set("post", id);
    return url.toString();
  };
  const meta = (p: Post) => (
    <PostMeta
      className="post-meta"
      avatar={<Avatar value={profile.icon} />}
      author={profile.name}
      kind={p.kind}
      date={p.date}
      updatedAt={p.updatedAt}
      kindLabel={label[p.kind]}
      kindLabelClassName={"type-label " + p.kind}
    />
  );
  const actions = (p: Post) => (
    <PostActions className="post-actions">
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
                    federationEnabled: p.federationEnabled === true,
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
    </PostActions>
  );
  return (
    <div className="notebook">
      <Toaster position="bottom-center" theme="light" />
      {xFallbackAction}
      <div data-ds="site-layout" className="site-layout">
        <aside data-ds="public-sidebar" className="public-sidebar">
          <button
            data-ds="site-name"
            className="site-name"
            onClick={() => nav("home")}
          >
            <strong>kamelog</strong>
            <ChevronDown size={15} />
          </button>
          <SideNavigation
            items={[
              {
                id: "home",
                label: "ホーム",
                icon: <Home />,
                active: view === "home",
              },
              {
                id: "timeline",
                label: "タイムライン",
                icon: <MessageCircle />,
                active: view === "timeline",
              },
              {
                id: "projects",
                label: "プロジェクト",
                icon: <Globe />,
                active: view === "projects",
              },
            ]}
            onSelect={(id) => nav(id as View)}
          />
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
            href={contact.github}
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
                variant="solid"
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
              <details data-ds="admin-access" className="admin-access">
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
                <section data-ds="owner-settings" className="settings-page">
                  <PageHeader title="アカウント" />
                  <div data-ds="owner-profile" className="setting-avatar">
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
                  <div data-ds="owner-avatar-picker" className="emoji-options">
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
                    variant="solid"
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
                  <OwnerSection
                    data-ds="owner-federation"
                    className="federation-settings"
                    title="Fediverse"
                    description="ActivityPubに対応すると、Fediverseからこのサイトをフォローできます。"
                    icon={<Globe size={18} aria-hidden="true" />}
                  >
                    {federationLoadError ? (
                      <div className="federation-load-error" role="alert">
                        <p>Fediverse設定を読み込めませんでした。</p>
                        <Button
                          type="button"
                          onClick={() => void loadFederationStatus()}
                        >
                          再試行
                        </Button>
                      </div>
                    ) : !federationStatus ? (
                      <p className="federation-state" role="status">
                        設定を読み込んでいます
                      </p>
                    ) : federationStatus.enabled ? (
                      <div className="federation-enabled">
                        <div className="federation-identity">
                          <p className="federation-state">
                            <Check size={16} aria-hidden="true" />
                            有効
                          </p>
                          <strong>{federationStatus.handle}</strong>
                          <Button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard
                                .writeText(federationStatus.handle)
                                .then(() =>
                                  toast.success("アドレスをコピーしました"),
                                )
                                .catch(() =>
                                  toast.error("コピーできませんでした"),
                                );
                            }}
                          >
                            アドレスをコピー
                          </Button>
                        </div>
                        <section
                          data-ds="owner-following"
                          className="federation-following"
                          aria-labelledby="federation-following-heading"
                        >
                          <div>
                            <h3 id="federation-following-heading">
                              フォロー管理
                            </h3>
                            <p>
                              Fediverseのアドレスから相手を探してフォローします。
                            </p>
                          </div>
                          <form
                            className="federation-follow-form"
                            aria-busy={federationFollowBusy}
                            onSubmit={(event) => {
                              event.preventDefault();
                              void federationFollow();
                            }}
                          >
                            <label htmlFor="federation-follow-handle">
                              Fediverseアドレス
                            </label>
                            <div>
                              <input
                                id="federation-follow-handle"
                                name="federation-follow-handle"
                                value={federationFollowHandle}
                                placeholder="@alice@example.social"
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                maxLength={384}
                                aria-invalid={Boolean(federationFollowError)}
                                onChange={(event) => {
                                  setFederationFollowHandle(event.target.value);
                                  if (federationFollowError)
                                    setFederationFollowError("");
                                }}
                              />
                              <Button
                                variant="solid"
                                type="submit"
                                disabled={federationFollowBusy}
                              >
                                フォロー
                              </Button>
                            </div>
                          </form>
                          {federationFollowError && (
                            <p className="federation-error" role="alert">
                              {federationFollowError}
                            </p>
                          )}
                          {federationFollowing.length ? (
                            <ul className="federation-follow-list">
                              {federationFollowing.map((following) => (
                                <li key={following.actorId}>
                                  <div>
                                    <strong>{following.displayName}</strong>
                                    <span>
                                      {following.handle ||
                                        `@${following.preferredUsername}`}
                                    </span>
                                  </div>
                                  <span
                                    className={`federation-follow-state is-${following.state}`}
                                  >
                                    {
                                      {
                                        pending: "承認待ち",
                                        accepted: "フォロー中",
                                        rejected: "拒否",
                                        failed: "失敗",
                                      }[following.state]
                                    }
                                  </span>
                                  <Button
                                    type="button"
                                    disabled={federationFollowBusy}
                                    onClick={() =>
                                      void federationUnfollow(following.actorId)
                                    }
                                  >
                                    フォロー解除
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="federation-follow-empty">
                              まだフォローしているアカウントはありません。
                            </p>
                          )}
                        </section>
                      </div>
                    ) : (
                      <form
                        data-ds="owner-federation-setup"
                        className="federation-setup"
                        aria-busy={federationBusy}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const username = federationUsername
                            .trim()
                            .toLowerCase();
                          if (!/^[a-z0-9_]{1,64}$/.test(username)) {
                            setFederationError(
                              "半角小文字、数字、アンダースコアを1〜64文字で入力してください。",
                            );
                            return;
                          }
                          setFederationBusy(true);
                          setFederationError("");
                          void api<FederationStatus>(
                            "federation/setup",
                            "POST",
                            { username },
                          )
                            .then((status) => {
                              setFederationStatus(status);
                              toast.success("ActivityPubを有効にしました");
                            })
                            .catch((error) => {
                              setFederationError(
                                error instanceof Error
                                  ? error.message
                                  : "有効化できませんでした。",
                              );
                            })
                            .finally(() => setFederationBusy(false));
                        }}
                      >
                        <label htmlFor="federation-username">ユーザー名</label>
                        <p
                          className="federation-hint"
                          id="federation-username-hint"
                        >
                          有効化後は変更できません。
                        </p>
                        <input
                          id="federation-username"
                          name="federation-username"
                          value={federationUsername}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          maxLength={64}
                          aria-describedby={
                            federationError
                              ? "federation-username-hint federation-username-error"
                              : "federation-username-hint"
                          }
                          aria-invalid={Boolean(federationError)}
                          onChange={(event) => {
                            setFederationUsername(event.target.value);
                            if (federationError) setFederationError("");
                          }}
                        />
                        <div className="federation-handle-preview">
                          <span>あなたのFediverseアドレス</span>
                          <strong>
                            @
                            {federationUsername.trim().toLowerCase() ||
                              "username"}
                            @{federationStatus.host}
                          </strong>
                        </div>
                        {federationError && (
                          <p
                            id="federation-username-error"
                            className="federation-error"
                            role="alert"
                          >
                            {federationError}
                          </p>
                        )}
                        <Button
                          variant="solid"
                          type="submit"
                          disabled={federationBusy}
                        >
                          {federationBusy
                            ? "ActivityPubを有効にしています"
                            : "ActivityPubを有効にする"}
                        </Button>
                      </form>
                    )}
                  </OwnerSection>
                </section>
              ) : view === "projects" ? (
                <section data-ds="projects-page" className="projects-page">
                  <PageHeader title="プロジェクト" />
                  <ProjectList
                    className="project-grid"
                    tileClassName="project-tile"
                    staticTileClassName="project-tile project-tile-static"
                    items={projects.map((project) => ({
                      slug: project.slug,
                      title: project.title,
                      summary: project.summary,
                      stack: project.stack,
                      thumbnail: project.thumbnail,
                      source: project.links.source,
                    }))}
                  />
                </section>
              ) : item ? (
                <section
                  data-ds="detail-page"
                  className={`detail-page${
                    item.kind === "tweet" ? " tweet-thread-detail" : ""
                  }`}
                >
                  <button className="back-button" onClick={closePost}>
                    <ArrowLeft size={17} />
                    戻る
                  </button>
                  {item.kind === "tweet" && (
                    <div data-kamelog-thread-before="true" />
                  )}
                  <div
                    className={
                      item.kind === "tweet" ? threadStyles.current : undefined
                    }
                  >
                    {item.kind === "tweet" && (
                      <span className={threadStyles.currentLabel}>
                        表示中の投稿
                      </span>
                    )}
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
                    <TagList
                      className="tags"
                      tags={item.tags}
                      automaticTags={item.autoTags?.map((tag) => tag.tag)}
                      renderTag={(tag, automatic) => (
                        <Badge
                          variant="gray"
                          title={automatic ? "自動で付与されたタグ" : undefined}
                          aria-label={automatic ? "自動タグ " + tag : undefined}
                        >
                          {automatic ? "AI · " + tag : tag}
                        </Badge>
                      )}
                    />
                    {actions(item)}
                  </div>
                  {item.kind === "tweet" && (
                    <div data-kamelog-thread-after="true" />
                  )}
                </section>
              ) : view === "home" ? (
                <section data-ds="landing-page" className="landing-page">
                  <div className="landing-intro">
                    <div className="landing-copy">
                      <h1>
                        かめさん{" "}
                        <span className="engineering-role">
                          Backend Engineer
                        </span>
                      </h1>
                      <p className="landing-lead">
                        Goを中心に、自社Webサービスのバックエンド開発をしています。APIやデータベースの実装から、複数システムにまたがる機能設計、他職種との仕様調整まで担当しています。個人ではWebサービスの設計・実装から自宅サーバーでの運用までしています。
                      </p>
                      <ContactLinks />
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
                    <aside
                      data-ds="landing-profile"
                      className="landing-profile"
                    >
                      <Avatar value={profile.icon} large />
                      <div>
                        <span>プロフィール</span>
                        <h2>{profile.name}</h2>
                        <p>@kamesan1577 · Backend Engineer</p>
                      </div>
                      <p className="landing-bio">{profile.bio}</p>
                      <a href={contact.github} target="_blank" rel="noreferrer">
                        GitHubでコードを見る <ArrowUpRight size={14} />
                      </a>
                    </aside>
                  </div>

                  <EngineeringProfile />
                  <div className="landing-lower">
                    <ContentIndex
                      className="content-index"
                      items={
                        [
                          {
                            id: "blog",
                            icon: <FileText size={18} />,
                            title: "ブログ",
                            description: "技術、開発、個人制作についての記事",
                            count: posts.filter((p) => p.kind === "blog")
                              .length,
                          },
                          {
                            id: "tweet",
                            icon: <MessageCircle size={18} />,
                            title: "つぶやき",
                            description: "日々の短いメモ",
                            count: posts.filter((p) => p.kind === "tweet")
                              .length,
                          },
                          {
                            id: "vlog",
                            icon: <Video size={18} />,
                            title: "vlog",
                            description: "数秒から30秒までの動画",
                            count: posts.filter((p) => p.kind === "vlog")
                              .length,
                          },
                        ] as const
                      }
                      onSelect={(id) => {
                        nav("timeline");
                        setFilter(id as Kind);
                      }}
                    />

                    <div className="featured-area">
                      <div className="landing-section-title">
                        <h2>いま読まれている</h2>
                      </div>
                      {featuredPost ? (
                        <button
                          data-ds="featured-post"
                          className="featured-post"
                          onClick={() => openPost(featuredPost.id)}
                        >
                          <span className="featured-meta">
                            {label[featuredPost.kind]}
                            <span>·</span>
                            {new Date(featuredPost.date).toLocaleDateString(
                              "ja-JP",
                              { month: "numeric", day: "numeric" },
                            )}
                            <span>·</span>
                            <Eye size={12} /> {featuredPost.views ?? 0}
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
                  <PageHeader className="page-heading" title="タイムライン" />
                  {timelineMode === "kamelog" && (
                    <label
                      data-ds="mobile-search"
                      className="home-search mobile-search"
                    >
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
                  )}
                  {login && federationStatus?.enabled && (
                    <Tabs
                      value={timelineMode}
                      onValueChange={(value) => {
                        const next = value as "kamelog" | "fediverse";
                        setTimelineMode(next);
                        if (next === "fediverse") void loadFederationTimeline();
                      }}
                    >
                      <TabsList
                        data-ds="fediverse-mode-switch"
                        className="fediverse-mode-switch"
                      >
                        <TabsTrigger value="kamelog">kamelog</TabsTrigger>
                        <TabsTrigger value="fediverse">Fediverse</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                  {login && timelineMode === "kamelog" && (
                    <InlineComposer
                      className="composer desktop-composer"
                      startClassName="composer-start"
                      bodyClassName="inline-tweet"
                      avatar={<Avatar value={profile.icon} />}
                      value={inlineBody}
                      onValueChange={setInlineBody}
                      onSubmit={publishInlineTweet}
                      onDrop={(event) => droppedImages(event, "inline")}
                      placeholder="いまどうしてる？"
                      maxLength={5000}
                      submit={
                        <Button
                          variant="solid"
                          size="sm"
                          onClick={publishInlineTweet}
                          disabled={!inlineBody.trim() && !inlineImages.length}
                        >
                          投稿
                        </Button>
                      }
                      media={
                        inlineImages.length > 0 ? (
                          <div className="composer-images">
                            <ImageGallery images={inlineImages} />
                            <button
                              type="button"
                              onClick={() => setInlineImages([])}
                            >
                              画像を取り消す
                            </button>
                          </div>
                        ) : undefined
                      }
                      toolbar={
                        <div
                          data-ds="composer-toolbar"
                          className="composer-kinds"
                        >
                          {xToggle("tweet")}
                          {federationToggle(
                            "tweet",
                            inlineFederationEnabled,
                            setInlineFederationEnabled,
                          )}
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
                      }
                    />
                  )}
                  {timelineMode === "kamelog" ? (
                    <>
                      <TimelineToolbar
                        className="timeline-toolbar"
                        filter={filter}
                        onFilterChange={(value) =>
                          setFilter(value as "all" | Kind)
                        }
                        sort={sort}
                        onSortChange={setSort}
                      />
                      {tag && (
                        <div data-ds="filter-active" className="filter-active">
                          #{tag}
                          <button onClick={() => setTag("")}>
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      <div className="feed">
                        {shown.map((p) =>
                          p.kind === "repost" ? (
                            <article className="post public-repost" key={p.id}>
                              <p className="public-repost-label">
                                {profile.name}がRP
                              </p>
                              <div className="fediverse-post-meta">
                                <Avatar
                                  value={
                                    p.displayName.trim().slice(0, 1) || "•"
                                  }
                                />
                                <div>
                                  <strong>{p.displayName}</strong>
                                  <span>{p.handle}</span>
                                </div>
                                <time dateTime={p.publishedAt}>
                                  {new Date(p.publishedAt).toLocaleDateString(
                                    "ja-JP",
                                    { month: "numeric", day: "numeric" },
                                  )}
                                </time>
                              </div>
                              <div
                                className="fediverse-content"
                                dangerouslySetInnerHTML={{
                                  __html: p.contentHtml,
                                }}
                              />
                              {p.attachments.length > 0 && (
                                <div className="fediverse-attachments">
                                  {p.attachments.map((attachment) => (
                                    <img
                                      key={attachment.url}
                                      src={attachment.url}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ))}
                                </div>
                              )}
                              <div className="fediverse-post-actions">
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  元の投稿を開く
                                  <ArrowUpRight size={14} />
                                </a>
                              </div>
                            </article>
                          ) : (
                            <TimelineItem
                              className={"post " + p.kind}
                              kind={p.kind}
                              key={p.id}
                              pinned={p.pinned}
                              pinnedClassName="pinned"
                              pinnedLabel={
                                <>
                                  <Pin size={12} />
                                  固定
                                </>
                              }
                            >
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
                                <PostPreview
                                  title={
                                    p.kind === "blog" ? p.title : undefined
                                  }
                                  excerpt={
                                    p.kind === "blog"
                                      ? p.body
                                          .split("\n")
                                          .find(
                                            (s) => s && !s.startsWith("#"),
                                          ) || ""
                                      : p.body
                                  }
                                  excerptClassName={
                                    p.kind === "tweet"
                                      ? "tweet-body"
                                      : undefined
                                  }
                                  className="post-focus"
                                  onClick={() => openPost(p.id)}
                                />
                              )}
                              {p.kind === "tweet" && (
                                <ImageGallery images={p.images} />
                              )}
                              {p.tags.length > 0 && (
                                <TagList
                                  className="tags"
                                  tags={p.tags}
                                  automaticTags={p.autoTags?.map(
                                    (tag) => tag.tag,
                                  )}
                                  onTagSelect={setTag}
                                  renderTag={(tag, automatic) => (
                                    <Badge
                                      variant={tag === "Go" ? "blue" : "gray"}
                                      title={
                                        automatic
                                          ? "自動で付与されたタグ"
                                          : undefined
                                      }
                                      aria-label={
                                        automatic
                                          ? "自動タグ " + tag
                                          : undefined
                                      }
                                    >
                                      {automatic ? "AI · " + tag : tag}
                                    </Badge>
                                  )}
                                />
                              )}
                              {actions(p)}
                            </TimelineItem>
                          ),
                        )}
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
                  ) : (
                    <section
                      data-ds="fediverse-timeline"
                      className="fediverse-timeline"
                      aria-labelledby="fediverse-timeline-heading"
                    >
                      <div className="fediverse-timeline-heading">
                        <div>
                          <h2 id="fediverse-timeline-heading">Fediverse</h2>
                          <p>フォロー中の投稿と自分の配信済み投稿</p>
                        </div>
                        <button
                          type="button"
                          aria-label="Fediverseを更新"
                          disabled={federationTimelineBusy}
                          onClick={() => void loadFederationTimeline()}
                        >
                          <RefreshCw
                            size={17}
                            className={
                              federationTimelineBusy ? "is-spinning" : ""
                            }
                          />
                        </button>
                      </div>
                      {federationTimelineError && (
                        <div className="fediverse-timeline-error" role="alert">
                          <p>{federationTimelineError}</p>
                          <Button
                            type="button"
                            onClick={() => void loadFederationTimeline()}
                          >
                            再試行
                          </Button>
                        </div>
                      )}
                      {!federationTimelineError &&
                        !federationTimelineBusy &&
                        !federationTimeline.length && (
                          <div className="empty-state">
                            <p>受信した投稿はまだありません。</p>
                          </div>
                        )}
                      <div className="fediverse-feed">
                        {federationTimeline.map((timelineItem) => (
                          <article
                            className="fediverse-post"
                            key={timelineItem.id}
                          >
                            {timelineItem.activityType === "Announce" && (
                              <p className="fediverse-announced">
                                {timelineItem.displayName}がRP
                              </p>
                            )}
                            <div className="fediverse-post-meta">
                              <Avatar
                                value={
                                  timelineItem.source === "self"
                                    ? profile.icon
                                    : timelineItem.displayName
                                        .trim()
                                        .slice(0, 1) || "•"
                                }
                              />
                              <div>
                                <strong>{timelineItem.displayName}</strong>
                                <span>{timelineItem.handle}</span>
                              </div>
                              <time dateTime={timelineItem.publishedAt}>
                                {new Date(
                                  timelineItem.publishedAt,
                                ).toLocaleDateString("ja-JP", {
                                  month: "numeric",
                                  day: "numeric",
                                })}
                              </time>
                            </div>
                            <div
                              className="fediverse-content"
                              dangerouslySetInnerHTML={{
                                __html: timelineItem.contentHtml,
                              }}
                            />
                            {timelineItem.attachments.length > 0 && (
                              <div className="fediverse-attachments">
                                {timelineItem.attachments.map((attachment) => (
                                  <img
                                    key={attachment.url}
                                    src={attachment.url}
                                    alt=""
                                    loading="lazy"
                                  />
                                ))}
                              </div>
                            )}
                            <div className="fediverse-post-actions">
                              <a
                                href={timelineItem.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                元の投稿を開く
                                <ArrowUpRight size={14} />
                              </a>
                              {timelineItem.source === "remote" && (
                                <button
                                  type="button"
                                  className={
                                    timelineItem.reposted ? "is-reposted" : ""
                                  }
                                  disabled={
                                    federationRepostBusy ===
                                    timelineItem.objectId
                                  }
                                  onClick={() =>
                                    void federationRepost(timelineItem)
                                  }
                                >
                                  {timelineItem.reposted
                                    ? "RPを取り消す"
                                    : "RP"}
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                      {federationTimelineCursor && (
                        <Button
                          type="button"
                          className="fediverse-load-more"
                          disabled={federationTimelineBusy}
                          onClick={() =>
                            void loadFederationTimeline(
                              federationTimelineCursor,
                              true,
                            )
                          }
                        >
                          さらに読み込む
                        </Button>
                      )}
                    </section>
                  )}
                </>
              )}
            </main>
            <aside
              data-ds="right-sidebar"
              className={
                "right-sidebar " + (view === "home" ? "landing-hidden" : "")
              }
            >
              <div data-ds="profile-card" className="profile-card">
                <Avatar value={profile.icon} large />
                <h2>{profile.name}</h2>
                <span className="profile-handle">@kamesan1577</span>
                <p>{profile.bio}</p>
                <a href={contact.github} target="_blank" rel="noreferrer">
                  GitHub
                  <ArrowUpRight size={14} />
                </a>
              </div>
              {(view !== "timeline" || timelineMode === "kamelog") && (
                <>
                  <label data-ds="side-search" className="side-search">
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
                          onClick={() =>
                            setVisibleTagCount((count) => count + 5)
                          }
                        >
                          もっと見る
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
          <MobileNavigation
            className="mobile-nav"
            items={[
              {
                id: "home",
                label: "ホーム",
                icon: <Home />,
                active: view === "home",
              },
              {
                id: "timeline",
                label: "タイムライン",
                icon: <MessageCircle />,
                active: view === "timeline",
              },
              {
                id: "projects",
                label: "プロジェクト",
                icon: <Globe />,
                active: view === "projects",
              },
            ]}
            onSelect={(id) => nav(id as View)}
          />
          {login && (
            <button
              data-ds="mobile-create"
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
          data-ds="editor-dialog"
          data-ds-state={
            kind === "blog" && fullPageEditor ? "full-page" : "modal"
          }
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
          <header
            data-ds="mobile-editor-header"
            className="mobile-editor-header"
          >
            <button
              type="button"
              className="mobile-editor-close"
              onClick={askClose}
              aria-label="投稿画面を閉じる"
            >
              <X size={22} />
            </button>
            <strong>
              {editId ? "投稿を編集" : draftId ? "下書きを編集" : "新規投稿"}
            </strong>
            <div className="mobile-editor-actions">
              {kind !== "vlog" && (
                <button type="button" onClick={saveDraft}>
                  下書き保存
                </button>
              )}
              <Button
                type="button"
                variant="solid"
                onClick={kind === "vlog" ? postVlog : publish}
                disabled={uploadingImages || (kind === "vlog" && !clip)}
              >
                {editId ? "更新" : "投稿"}
              </Button>
            </div>
          </header>
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
                        setEditorFederationEnabled(true);
                        setEditId(null);
                        setDraftId(draft.id);
                        setEditorStart(
                          JSON.stringify({
                            k: draft.kind,
                            t: draft.title,
                            b: draft.body,
                            images: draft.images || [],
                            federation: true,
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
          {xToggle(kind)}
          {federationToggle(
            kind,
            editorFederationEnabled,
            setEditorFederationEnabled,
          )}
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
              <div data-ds="vlog-stage" className="vlog-stage">
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
                    <Button variant="solid" onClick={postVlog}>
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
                <BlogEditorToolbar
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
                </BlogEditorToolbar>
              )}
              {kind === "blog" ? (
                <BlogEditorWorkspace
                  className={"blog-editor-workspace mode-" + blogEditorMode}
                  mode={blogEditorMode}
                  editor={
                    <textarea
                      ref={bodyInput}
                      className="body-input blog"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="本文"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => droppedImages(event, "blog")}
                    />
                  }
                  preview={
                    <div className="editor-preview" aria-label="プレビュー">
                      <Markdown text={"# " + title + "\n\n" + body} />
                    </div>
                  }
                />
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
              <MediaUploadField
                className="editor-media-row"
                labelClassName="image-upload-button"
                icon={<ImageIcon />}
                label={
                  kind === "blog"
                    ? "画像を本文末尾へ追加"
                    : `画像を追加（${editorImages.length}/4）`
                }
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple={kind === "tweet"}
                disabled={
                  uploadingImages ||
                  (kind === "tweet" && editorImages.length >= 4)
                }
                onFilesSelected={(files) =>
                  void uploadImages(files, kind === "blog" ? "blog" : "tweet")
                }
                status={
                  uploadingImages ? <span>アップロード中…</span> : undefined
                }
              />
              {kind === "tweet" && editorImages.length > 0 && (
                <div className="composer-images">
                  <ImageGallery images={editorImages} />
                  <button type="button" onClick={() => setEditorImages([])}>
                    画像を取り消す
                  </button>
                </div>
              )}
              <EditorFooter
                className="editor-footer"
                characterCount={body.length}
                closeAction={<Button onClick={askClose}>閉じる</Button>}
                submitAction={
                  <Button variant="solid" onClick={publish}>
                    投稿
                  </Button>
                }
              />
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
            <Button variant="solid" onClick={saveDraft}>
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
    <div data-ds="vlog-frame" className="vlog-frame">
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
