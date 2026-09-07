"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Code2,
  Eye,
  FileText,
  Globe,
  Heart,
  Home,
  MessageCircle,
  MoreHorizontal,
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

type Kind = "blog" | "tweet" | "vlog";
type Post = {
  revision?: number;
  id: string;
  kind: Kind;
  title: string;
  body: string;
  date: string;
  tags: string[];
  likes: number;
  video?: string;
  time?: string;
  pinned?: boolean;
};
type Draft = {
  revision?: number;
  id: string;
  kind: "blog" | "tweet";
  title: string;
  body: string;
  savedAt: string;
};
const label: Record<Kind, string> = {
  blog: "ãã­ã°",
  tweet: "ã¤ã¶ãã",
  vlog: "vlog",
};

function Avatar({
  value = "ð¢",
  large = false,
}: {
  value?: string;
  large?: boolean;
}) {
  return (
    <span className={"avatar " + (large ? "large" : "")}>
      {value.startsWith("data:image/") ? (
        <img src={value} alt="ãã­ãã£ã¼ã«" />
      ) : (
        value
      )}
    </span>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

const markdownHelp = [
  ["æ®µè½", "ç©ºè¡ã§æ®µè½ãåãã", "1ã¤ç®ã®æ®µè½\n\n2ã¤ç®ã®æ®µè½"],
  ["æ¹è¡", "è¡æ«ã«åè§ã¹ãã¼ã¹2ã¤ãã¾ãã¯ \\ ãç½®ã", "1è¡ç®  \n2è¡ç®"],
  ["è¦åºã", "# ã¯1ã6åã¾ã§ä½¿ãã", "## è¦åºã2\n### è¦åºã3"],
  ["å¤ªå­", "æå­ã ** ã§å²ã", "**å¤ªå­**"],
  ["æä½", "æå­ã _ ã§å²ã", "_æä½_"],
  ["åãæ¶ãç·", "æå­ã ~~ ã§å²ã", "~~åãæ¶ã~~"],
  ["ç®æ¡æ¸ã", "-ã*ã+ ã®ãããããä½¿ã", "- é ç®1\n- é ç®2"],
  ["çªå·ä»ããªã¹ã", "æ°å­ã¨ããªãªããä½¿ã", "1. é ç®1\n2. é ç®2"],
  ["å¥ãå­ãªã¹ã", "å­é ç®ãã¹ãã¼ã¹ã§å­ä¸ããã", "- è¦ª\n  - å­"],
  [
    "ãã§ãã¯ãªã¹ã",
    "è§æ¬å¼§åã«ã¯åè§ã¹ãã¼ã¹ã x ãå¥ãã",
    "- [ ] æªå®äº\n- [x] å®äº",
  ],
  ["å¼ç¨", "è¡é ­ã« > ãä»ãã", "> å¼ç¨æ"],
  ["ãªã³ã¯", "è¡¨ç¤ºæå­ã¨URLãæ¸ã", "[ãªã³ã¯](https://example.com)"],
  [
    "URLã®èªåãªã³ã¯",
    "URLã¾ãã¯ã¡ã¼ã«ã¢ãã¬ã¹ãå±±æ¬å¼§ã§å²ã",
    "<https://example.com>",
  ],
  [
    "ç»å",
    "åé ­ã« ! ãä»ããä»£æ¿ãã­ã¹ãã¨ç»åURLãæ¸ã",
    "![ä»£æ¿ãã­ã¹ã](https://example.com/image.png)",
  ],
  ["ã¤ã³ã©ã¤ã³ã³ã¼ã", "æå­ã ` ã§å²ã", "`const value = 1`"],
  [
    "ã³ã¼ããã­ãã¯",
    "``` ã®ç´å¾ã«è¨èªåãæ¸ãã¨è²åãããã",
    "```javascript\nconst answer = 42;\n```",
  ],
  [
    "è¡¨",
    "2è¡ç®ã§åã¨ä½ç½®æããæå®ãã",
    "| å·¦ | ä¸­å¤® | å³ |\n| :-- | :--: | --: |\n| A | B | C |",
  ],
  ["åºåãç·", "ãã¤ãã³ã3åä»¥ä¸ä¸¦ã¹ã", "---"],
  [
    "ã¨ã¹ã±ã¼ã",
    "è¨å·ã®ç´åã« \\ ãç½®ãã¦ããã®ã¾ã¾è¡¨ç¤ºãã",
    "\\*æä½ã«ããªã\\*",
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
          <span className="mock-label">ã¢ãã¯</span>
        </span>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="auto">èªå</TabsTrigger>
            <TabsTrigger value="desktop">PC</TabsTrigger>
            <TabsTrigger value="mobile">ã¹ãã</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="preview-size">
          {mode === "auto"
            ? "ã¬ã¹ãã³ã·ã"
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
            title="ãµã¤ããã¬ãã¥ã¼"
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
        error instanceof Error ? error.message : "æä½ã«å¤±æãã¾ããã",
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
        name: "ãããã",
        icon: "ð¢",
        bio: "ã¤ãã£ããã®ã¨æ¥ãã®è¨é²ã",
      },
    ),
    [liked, setLiked] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [ready, setReady] = useState(false);
  const [login, setLogin] = useState(false),
    [view, setView] = useState<"home" | "projects" | "account">("home"),
    [filter, setFilter] = useState<"all" | Kind>("all"),
    [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState<"new" | "popular">("new"),
    [selected, setSelected] = useState<string | null>(initialSelected);
  const [editor, setEditor] = useState(false),
    [kind, setKind] = useState<Kind>("tweet"),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [editId, setEditId] = useState<string | null>(null),
    [draftId, setDraftId] = useState<string | null>(null),
    [editorStart, setEditorStart] = useState(""),
    [preview, setPreview] = useState(false),
    [markdownHelpOpen, setMarkdownHelpOpen] = useState(false),
    [closeAsk, setCloseAsk] = useState(false),
    [draftList, setDraftList] = useState(false),
    [editorDrafts, setEditorDrafts] = useState(false),
    [inlineBody, setInlineBody] = useState(""),
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
      .catch(() => toast.error("æ¥ç¶ã§ãã¾ãããåèª­ã¿è¾¼ã¿ãã¦ãã ããã"));
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
  const nav = (v: "home" | "projects" | "account") => {
    setView(v);
    setSelected(null);
    setTag("");
    if (v === "home" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
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
    setEditId(p?.id || null);
    setDraftId(d?.id || null);
    setEditorStart(JSON.stringify({ k, t, b }));
    setPreview(false);
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
      setEditId(null);
      setDraftId(null);
      setEditorStart(JSON.stringify({ k: "tweet", t: "", b: "" }));
      setPreview(false);
      setEditorDrafts(false);
      setEditor(true);
    };
    window.addEventListener("keydown", openWithN);
    return () => window.removeEventListener("keydown", openWithN);
  }, [editor, login]);
  useEffect(() => {
    if (!editor || kind === "vlog" || preview) return;
    requestAnimationFrame(() =>
      (kind === "blog" ? titleInput.current : bodyInput.current)?.focus(),
    );
  }, [editor, kind, preview]);
  const dirty = JSON.stringify({ k: kind, t: title, b: body }) !== editorStart;
  const askClose = () => {
    if (kind === "vlog") {
      closeComposer();
      return;
    }
    if (dirty && (title.trim() || body.trim())) setCloseAsk(true);
    else setEditor(false);
  };
  const saveDraft = () =>
    guard(async () => {
      if (kind === "vlog") return;
      const old = drafts.find((d) => d.id === draftId);
      const saved = await api<Draft>(
        "drafts" + (draftId ? "/" + draftId : ""),
        draftId ? "PUT" : "POST",
        { kind, title, body, ...(old ? { revision: old.revision } : {}) },
      );
      setDrafts((ds) => [saved, ...ds.filter((d) => d.id !== saved.id)]);
      setEditor(false);
      setCloseAsk(false);
      toast.success("ä¸æ¸ããä¿å­ãã¾ãã");
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
          ...(old ? { revision: old.revision } : {}),
        },
      );
      setPosts((ps) => [saved, ...ps.filter((p) => p.id !== saved.id)]);
      setEditor(false);
      nav("home");
      setFilter("all");
      toast.success(editId ? "æ´æ°ãã¾ãã" : "æç¨¿ãã¾ãã");
      if (draftId) {
        try {
          await api("drafts/" + draftId, "DELETE", undefined, {
            "If-Match": String(drafts.find((d) => d.id === draftId)?.revision),
          });
          setDrafts((ds) => ds.filter((d) => d.id !== draftId));
        } catch {
          toast.error("æç¨¿æ¸ã¿ã§ããä¸æ¸ãã®åé¤ã ãå¤±æãã¾ããã");
        }
      }
    });
  const publishInlineTweet = () => {
    const text = inlineBody.trim();
    if (!text) return;
    void guard(async () => {
      const saved = await api<Post>("posts", "POST", {
        kind: "tweet",
        title: "",
        body: text,
        tags: [],
        pinned: false,
      });
      setPosts((ps) => [saved, ...ps]);
      setInlineBody("");
      toast.success("æç¨¿ãã¾ãã");
    });
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
      setCameraError("ã«ã¡ã©ãä½¿ãã¾ãããåç»ãã¡ã¤ã«ã¯é¸æã§ãã¾ãã");
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
        "ãã®ãã©ã¦ã¶ã§ã¯ç´æ¥æ®å½±ã§ãã¾ãããåç»ãã¡ã¤ã«ãé¸ãã§ãã ããã",
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
      nav("home");
      setFilter("all");
      toast.success("vlogãæç¨¿ãã¾ãã");
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
      <span>Â·</span>
      <time>
        {new Date(p.date).toLocaleDateString("ja-JP", {
          month: "numeric",
          day: "numeric",
        })}
      </time>
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
          toast.success("ãªã³ã¯ãã³ãã¼ãã¾ãã");
        }}
      >
        <Share2 size={16} />
        ãªã³ã¯ãã³ãã¼
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
        Xã§å±æ
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
                ç·¨é
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
                  });
                  await refresh();
                })
              }
            >
              <Pin />
              åºå®
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => setRemove(p.id)}
            >
              <Trash2 />
              åé¤
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
              <span>ãã¼ã </span>
            </button>
            <button
              className={view === "projects" ? "active" : ""}
              onClick={() => nav("projects")}
            >
              <Globe />
              <span>ãã­ã¸ã§ã¯ã</span>
            </button>
          </nav>
          <div className="sidebar-section">
            <span>ã³ã³ãã³ã</span>
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
                  nav("home");
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
                æ°è¦æç¨¿
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
                <span>ã¢ã«ã¦ã³ã</span>
                <Settings />
              </button>
              <button onClick={logOut}>ã­ã°ã¢ã¦ã</button>
            </div>
          )}
          <div className="sidebar-foot">
            {!login ? (
              <details className="admin-access">
                <summary>â¢â¢â¢</summary>
                <button onClick={logIn}>ã­ã°ã¤ã³</button>
              </details>
            ) : (
              <span>ã­ã°ã¤ã³ä¸­</span>
            )}
            <small>Â© 2026 {profile.name}</small>
          </div>
        </aside>
        <div className="workspace">
          <header className="public-header">
            <button className="mobile-name" onClick={() => nav("home")}>
              <b>kamelog</b>
            </button>
            <span>
              {selected
                ? "æç¨¿"
                : view === "projects"
                  ? "ãã­ã¸ã§ã¯ã"
                  : view === "account"
                    ? "ã¢ã«ã¦ã³ã"
                    : "ãã¼ã "}
            </span>
            {!login ? (
              <details className="mobile-login">
                <summary>â¢â¢â¢</summary>
                <button onClick={logIn}>ã­ã°ã¤ã³</button>
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
                ç®¡ç
              </button>
            )}
          </header>
          <div className="content-grid">
            <main className="main-content">
              {view === "account" && login ? (
                <section className="settings-page">
                  <h1>ã¢ã«ã¦ã³ã</h1>
                  <div className="setting-avatar">
                    <Avatar value={icon || profile.icon} large />
                    <label className="upload-label">
                      <Upload size={15} />
                      ç»åãå¤æ´
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
                    {["ð¢", "ð¦¦", "ð", "ð±", "â", "ð¾"].map((x) => (
                      <button key={x} onClick={() => setIcon(x)}>
                        {x}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    åå
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    èªå·±ç´¹ä»
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
                          { name: name.trim(), bio, icon: icon || "ð¢" },
                        );
                        setProfile(saved);
                        toast.success("ä¿å­ãã¾ãã");
                      });
                    }}
                  >
                    ä¿å­
                  </Button>
                </section>
              ) : view === "projects" ? (
                <section className="projects-page">
                  <h1>ãã­ã¸ã§ã¯ã</h1>
                  <div className="project-grid">
                    <a
                      className="project-tile"
                      href="https://github.com/kamesan1577/kamelog"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src="/project-api.svg" alt="kamelogã®ãµã ãã¤ã«" />
                      <div>
                        <h2>
                          kamelog <ArrowUpRight size={16} />
                        </h2>
                        <p>ãã­ã°ã»ã¤ã¶ããã»vlogãã¾ã¨ããåäººãµã¤ã</p>
                        <span>TypeScript</span>
                      </div>
                    </a>
                    <a
                      className="project-tile"
                      href="https://qiita.com/kamesan1577"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src="/project-tools.svg" alt="Qiitaã®ãµã ãã¤ã«" />
                      <div>
                        <h2>
                          Qiita <ArrowUpRight size={16} />
                        </h2>
                        <p>æè¡è¨äº</p>
                        <span>Qiita</span>
                      </div>
                    </a>
                  </div>
                </section>
              ) : item ? (
                <section className="detail-page">
                  <button
                    className="back-button"
                    onClick={() => setSelected(null)}
                  >
                    <ArrowLeft size={17} />
                    æ»ã
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
                  <div className="tags">
                    {item.tags.map((t) => (
                      <Badge key={t} variant="gray">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  {actions(item)}
                </section>
              ) : (
                <>
                  <section className="page-heading">
                    <h1>ãã¼ã </h1>
                  </section>
                  <label className="home-search mobile-search">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="æç¨¿ãæ¤ç´¢"
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
                          placeholder="ãã¾ã©ããã¦ãï¼"
                          maxLength={5000}
                          rows={1}
                        />
                        <Button
                          variant="blue"
                          size="sm"
                          onClick={publishInlineTweet}
                          disabled={!inlineBody.trim()}
                        >
                          æç¨¿
                        </Button>
                      </div>
                      <div className="composer-kinds">
                        <button onClick={() => openEditor("blog")}>
                          <FileText />
                          ãã­ã°
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
                          ã¤ã¶ãã
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
                            ä¸æ¸ã {drafts.length}
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
                        <TabsTrigger value="all">ãã¹ã¦</TabsTrigger>
                        <TabsTrigger value="blog">ãã­ã°</TabsTrigger>
                        <TabsTrigger value="tweet">ã¤ã¶ãã</TabsTrigger>
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
                          æ°ããé  {sort === "new" && <Check />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSort("popular")}>
                          ããã­é  {sort === "popular" && <Check />}
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
                            åºå®
                          </div>
                        )}
                        {meta(p)}
                        {p.kind === "vlog" ? (
                          <div className="post-focus vlog-button">
                            <VlogFrame post={p} />
                            <button
                              className="open-vlog-detail"
                              onClick={() => setSelected(p.id)}
                            >
                              è©³ç´°
                            </button>
                          </div>
                        ) : (
                          <button
                            className="post-focus"
                            onClick={() => setSelected(p.id)}
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
                        <p>è©²å½ããæç¨¿ã¯ããã¾ããã</p>
                        <Button
                          onClick={() => {
                            setQuery("");
                            setFilter("all");
                            setTag("");
                          }}
                        >
                          è§£é¤
                        </Button>
                      </div>
                    )}
                    <div className="feed-count">{shown.length}ä»¶</div>
                  </div>
                </>
              )}
            </main>
            <aside className="right-sidebar">
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
                  placeholder="æç¨¿ãæ¤ç´¢"
                />
                <kbd>/</kbd>
              </label>
              <div className="aside-section">
                <h3>ã¿ã°</h3>
                <div className="topic-list">
                  {["Go", "ããã¯ã¨ã³ã", "TDD", "éçºæ¥è¨", "æ¥å¸¸"].map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() => {
                          nav("home");
                          setTag(t);
                          setFilter("all");
                        }}
                      >
                        #{t}
                        <small>
                          {posts.filter((p) => p.tags.includes(t)).length}
                        </small>
                      </button>
                    ),
                  )}
                </div>
              </div>
            </aside>
          </div>
          <nav className="mobile-nav">
            <button
              className={view === "home" ? "active" : ""}
              onClick={() => nav("home")}
            >
              <Home />
              <span>ãã¼ã </span>
            </button>
            <button
              className={view === "projects" ? "active" : ""}
              onClick={() => nav("projects")}
            >
              <Globe />
              <span>ãã­ã¸ã§ã¯ã</span>
            </button>
          </nav>
          {login && (
            <button
              className="mobile-create"
              onClick={() => openEditor("tweet")}
              aria-label="æç¨¿ãä½æ"
            >
              <Plus size={23} />
            </button>
          )}
        </div>
      </div>
      <Dialog open={editor} onOpenChange={(o) => !o && askClose()}>
        <DialogContent
          className={"editor-dialog " + (kind === "vlog" ? "vlog-dialog" : "")}
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
            {editId ? "æç¨¿ãç·¨é" : draftId ? "ä¸æ¸ããç·¨é" : "æ°è¦æç¨¿"}
          </DialogTitle>
          <DialogDescription>
            {kind === "blog"
              ? "Markdownãä½¿ãã¾ãã"
              : kind === "tweet"
                ? "ç­æãå¥åãã¾ãã"
                : "æ¨ªé·ã®ç­ãåç»ãæç¨¿ãã¾ãã"}
          </DialogDescription>
          {kind !== "vlog" && drafts.length > 0 && (
            <div className="editor-drafts">
              <button
                type="button"
                aria-expanded={editorDrafts}
                onClick={() => setEditorDrafts((open) => !open)}
              >
                ä¸æ¸ãããè²¼ãä»ã
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
                        setEditId(null);
                        setDraftId(draft.id);
                        setEditorStart(
                          JSON.stringify({
                            k: draft.kind,
                            t: draft.title,
                            b: draft.body,
                          }),
                        );
                        setEditorDrafts(false);
                      }}
                    >
                      <b>{draft.title || draft.body.slice(0, 36) || "ç¡é¡"}</b>
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
                ãã­ã°
              </TabsTrigger>
              <TabsTrigger value="tweet">
                <MessageCircle />
                ã¤ã¶ãã
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
                  <TabsTrigger value="camera">ä»æ®ã</TabsTrigger>
                  <TabsTrigger value="upload">åç»ãé¸ã¶</TabsTrigger>
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
                    åç»ãé¸ã¶
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
                    REC Â· {count}
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
                        {s}ç§
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
                    ã­ã£ãã·ã§ã³
                    <input
                      maxLength={60}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="ä¸æã ãï¼ä»»æï¼"
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
                      ããç´ã
                    </Button>
                    <Button variant="blue" onClick={postVlog}>
                      æç¨¿ãã
                    </Button>
                  </div>
                </>
              )}
              {!clip && vMode === "upload" && (
                <p className="crop-note">å¬éæã¯16:9ã§ä¸­å¤®ãåãæãã¾ãã</p>
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
                  placeholder="ã¿ã¤ãã«"
                />
              )}
              {kind === "blog" && (
                <div
                  className="editor-tools"
                  role="toolbar"
                  aria-label="Markdownè¨æ³"
                >
                  <div className="editor-tool-list">
                    <button
                      type="button"
                      aria-label="è¦åºã"
                      onClick={() => prefixMarkdownLines("## ", "è¦åºã")}
                    >
                      è¦åºã
                    </button>
                    <button
                      type="button"
                      aria-label="å¤ªå­"
                      onClick={() => wrapMarkdown("**", "**", "å¤ªå­")}
                    >
                      å¤ªå­
                    </button>
                    <button
                      type="button"
                      aria-label="æä½"
                      onClick={() => wrapMarkdown("_", "_", "æä½")}
                    >
                      æä½
                    </button>
                    <button
                      type="button"
                      aria-label="åãæ¶ãç·"
                      onClick={() => wrapMarkdown("~~", "~~", "åãæ¶ã")}
                    >
                      åæ¶
                    </button>
                    <button
                      type="button"
                      aria-label="å¼ç¨"
                      onClick={() => prefixMarkdownLines("> ", "å¼ç¨æ")}
                    >
                      å¼ç¨
                    </button>
                    <button
                      type="button"
                      aria-label="ç®æ¡æ¸ã"
                      onClick={() => prefixMarkdownLines("- ", "é ç®")}
                    >
                      ã»ãªã¹ã
                    </button>
                    <button
                      type="button"
                      aria-label="çªå·ä»ããªã¹ã"
                      onClick={() =>
                        prefixMarkdownLines((index) => `${index + 1}. `, "é ç®")
                      }
                    >
                      1. ãªã¹ã
                    </button>
                    <button
                      type="button"
                      aria-label="ãã§ãã¯ãªã¹ã"
                      onClick={() => prefixMarkdownLines("- [ ] ", "é ç®")}
                    >
                      â ãªã¹ã
                    </button>
                    <button
                      type="button"
                      aria-label="ãªã³ã¯"
                      onClick={() =>
                        wrapMarkdown("[", "](https://example.com)", "ãªã³ã¯")
                      }
                    >
                      ãªã³ã¯
                    </button>
                    <button
                      type="button"
                      aria-label="ç»å"
                      onClick={() =>
                        wrapMarkdown(
                          "![",
                          "](https://example.com/image.png)",
                          "ä»£æ¿ãã­ã¹ã",
                        )
                      }
                    >
                      ç»å
                    </button>
                    <button
                      type="button"
                      aria-label="ã¤ã³ã©ã¤ã³ã³ã¼ã"
                      onClick={() => wrapMarkdown("`", "`", "code")}
                    >
                      `code`
                    </button>
                    <button
                      type="button"
                      aria-label="ã³ã¼ããã­ãã¯"
                      onClick={() =>
                        wrapMarkdownBlock(
                          "```javascript\n",
                          "\n```",
                          "const answer = 42;",
                        )
                      }
                    >
                      ã³ã¼ã
                    </button>
                    <button
                      type="button"
                      aria-label="è¡¨"
                      onClick={() =>
                        insertMarkdownBlock(
                          "| å1 | å2 |\n| --- | --- |\n| å¤1 | å¤2 |",
                        )
                      }
                    >
                      è¡¨
                    </button>
                    <button
                      type="button"
                      aria-label="åºåãç·"
                      onClick={() => insertMarkdownBlock("---")}
                    >
                      åºåã
                    </button>
                  </div>
                  <button
                    type="button"
                    className="markdown-help-link"
                    aria-label="Markdownãã«ã"
                    onClick={() => setMarkdownHelpOpen(true)}
                  >
                    ãã«ã
                  </button>
                  <button
                    type="button"
                    className="preview-toggle"
                    onClick={() => setPreview((x) => !x)}
                  >
                    <Eye size={15} />
                    {preview ? "ç·¨é" : "ãã¬ãã¥ã¼"}
                  </button>
                </div>
              )}
              {preview && kind === "blog" ? (
                <div className="editor-preview">
                  <Markdown text={"# " + title + "\n\n" + body} />
                </div>
              ) : (
                <textarea
                  ref={bodyInput}
                  className={"body-input " + kind}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="æ¬æ"
                />
              )}
              <div className="editor-footer">
                <span>{body.length}æå­</span>
                <Button onClick={askClose}>éãã</Button>
                <Button variant="blue" onClick={publish}>
                  æç¨¿
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={markdownHelpOpen} onOpenChange={setMarkdownHelpOpen}>
        <DialogContent className="markdown-help-dialog">
          <DialogTitle>Markdownè¨æ³ãã«ã</DialogTitle>
          <DialogDescription>
            ãã­ã°ã§ä½¿ããCommonMarkã¨GFMã®è¨æ³ã§ããçHTMLã¯è¡¨ç¤ºããã¾ããã
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
          <DialogTitle>ãã®æç¨¿ãä¿å­ãã¾ããï¼</DialogTitle>
          <DialogDescription>
            ä¿å­ããªãå ´åãå¥ååå®¹ã¯åé¤ããã¾ãã
          </DialogDescription>
          <div className="confirm-actions">
            <Button onClick={() => setCloseAsk(false)}>ç·¨éãç¶ãã</Button>
            <Button onClick={discard}>åé¤ãã¦éãã</Button>
            <Button variant="blue" onClick={saveDraft}>
              ä¸æ¸ãä¿å­
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={draftList} onOpenChange={setDraftList}>
        <DialogContent>
          <DialogTitle>ä¸æ¸ã</DialogTitle>
          <DialogDescription>ãµã¼ãã¼ã«ä¿å­ããã¦ãã¾ãã</DialogDescription>
          <div className="draft-list">
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setDraftList(false);
                  openEditor(d.kind, undefined, d);
                }}
              >
                <b>{d.title || d.body.slice(0, 36) || "ç¡é¡"}</b>
                <span>
                  {label[d.kind]} Â·{" "}
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
          <AlertDialogTitle>æç¨¿ãåé¤ãã¾ããï¼</AlertDialogTitle>
          <AlertDialogDescription>
            å¬éãµã¤ãããåé¤ããã¾ãã
          </AlertDialogDescription>
          <AlertDialogFooter className="confirm-actions">
            <Button onClick={() => setRemove(null)}>ã­ã£ã³ã»ã«</Button>
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
              åé¤
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
          åç»ãªã
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
          ã«ã¼ãåçãåæ­¢
        </button>
      )}
    </div>
  );
}
