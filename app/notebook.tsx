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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { api, signIn } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  blog: "ブログ",
  tweet: "つぶやき",
  vlog: "vlog",
};

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
function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}

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
        name: "デモユーザー",
        icon: "🐢",
        bio: "作ったもの、考えたこと、日々の記録。",
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
    [closeAsk, setCloseAsk] = useState(false),
    [draftList, setDraftList] = useState(false),
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
    rec = useRef<MediaRecorder | null>(null),
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
  const nav = (v: "home" | "projects" | "account") => {
    setView(v);
    setSelected(null);
    setTag("");
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
    setEditor(true);
    if (k === "vlog") void prepareVlog();
  };
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
          ...(old ? { revision: old.revision } : {}),
        },
      );
      setPosts((ps) => [saved, ...ps.filter((p) => p.id !== saved.id)]);
      setEditor(false);
      nav("home");
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
  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };
  const prepareVlog = async () => {
    setVMode("camera");
    setClip("");
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
      const u = URL.createObjectURL(new Blob(chunks, { type }));
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
    const u = URL.createObjectURL(f);
    urls.current.push(u);
    setClip(u);
    stopCamera();
  };
  const postVlog = () =>
    guard(async () => {
      if (!clip) return;
      const blob = await (await fetch(clip)).blob();
      const upload = await fetch("/api/media?seconds=" + seconds, {
        method: "POST",
        body: blob,
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
  const item = posts.find((p) => p.id === selected);
  const meta = (p: Post) => (
    <div className="post-meta">
      <Avatar value={profile.icon} />
      <b>{profile.name}</b>
      <span>·</span>
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
          const u = new URL(location.href);
          u.searchParams.set("post", p.id);
          await navigator.clipboard.writeText(u.toString());
          toast.success("リンクをコピーしました");
        }}
      >
        <Share2 size={16} />
        共有
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
            href="https://github.com/example"
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
          <div className="content-grid">
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
                      href="https://github.com/example/example-api"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src="/project-api.svg"
                        alt="APIプロジェクトのサムネイル"
                      />
                      <div>
                        <h2>
                          Example API <ArrowUpRight size={16} />
                        </h2>
                        <p>サンプルのバックエンドAPI</p>
                        <span>Go</span>
                      </div>
                    </a>
                    <a
                      className="project-tile"
                      href="https://github.com/example"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src="/project-tools.svg"
                        alt="ツール集のサムネイル"
                      />
                      <div>
                        <h2>
                          Developer Tools <ArrowUpRight size={16} />
                        </h2>
                        <p>小さな開発ツール集</p>
                        <span>コード</span>
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
                    <h1>ホーム</h1>
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
                        <button onClick={() => openEditor("tweet")}>
                          投稿を作成
                        </button>
                        <Button
                          className="compose-plus"
                          size="circle"
                          onClick={() => openEditor("tweet")}
                          aria-label="投稿を作成"
                        >
                          <Plus />
                        </Button>
                      </div>
                      <div className="composer-kinds">
                        <button onClick={() => openEditor("blog")}>
                          <FileText />
                          ブログ
                        </button>
                        <button onClick={() => openEditor("tweet")}>
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
                              onClick={() => setSelected(p.id)}
                            >
                              詳細
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
            <aside className="right-sidebar">
              <div className="profile-card">
                <Avatar value={profile.icon} large />
                <h2>{profile.name}</h2>
                <span className="profile-handle">@example</span>
                <p>{profile.bio}</p>
                <a
                  href="https://github.com/example"
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
              <div className="aside-section">
                <h3>タグ</h3>
                <div className="topic-list">
                  {["Go", "バックエンド", "TDD", "開発日記", "日常"].map(
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
              <span>ホーム</span>
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
          className={"editor-dialog " + (kind === "vlog" ? "vlog-dialog" : "")}
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
                  className="title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="タイトル"
                />
              )}
              {kind === "blog" && (
                <div className="editor-tools">
                  <button onClick={() => setBody((b) => b + "\n## 見出し\n")}>
                    H2
                  </button>
                  <button onClick={() => setBody((b) => b + "**太字**")}>
                    B
                  </button>
                  <button onClick={() => setBody((b) => b + "\n```go\n\n```")}>
                    コード
                  </button>
                  <button
                    className="preview-toggle"
                    onClick={() => setPreview((x) => !x)}
                  >
                    <Eye size={15} />
                    {preview ? "編集" : "プレビュー"}
                  </button>
                </div>
              )}
              {preview && kind === "blog" ? (
                <div className="editor-preview">
                  <Markdown text={"# " + title + "\n\n" + body} />
                </div>
              ) : (
                <textarea
                  className={"body-input " + kind}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="本文"
                />
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
      <Dialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)}>
        <DialogContent>
          <DialogTitle>投稿を削除しますか？</DialogTitle>
          <DialogDescription>公開サイトから削除されます。</DialogDescription>
          <div className="confirm-actions">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function VlogFrame({ post }: { post: Post }) {
  return (
    <div className="vlog-frame">
      {post.video ? (
        <video
          src={post.video}
          controls
          playsInline
          preload="metadata"
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
    </div>
  );
}
