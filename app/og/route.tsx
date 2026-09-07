import { ImageResponse } from "next/og";
import { getStore } from "@/server/runtime.mjs";
import { socialCopy } from "@/lib/social";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("post");
  const post = id ? getStore().get("posts", id) : null;
  const copy = post ? socialCopy(post) : "ブログ、つぶやき、vlog";
  const kind = post
    ? { blog: "ブログ", tweet: "つぶやき", vlog: "vlog" }[
        post.kind as "blog" | "tweet" | "vlog"
      ] || "投稿"
    : "personal log";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 82px",
        color: "#37352f",
        background: "#f7f7f5",
        border: "18px solid #ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div
          style={{
            width: 58,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid #37352f",
            borderRadius: 8,
            background: "#ffffff",
            fontSize: 44,
            fontWeight: 800,
          }}
        >
          k
        </div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700 }}>
          kamelog
        </div>
      </div>
      <div
        style={{
          display: "flex",
          maxWidth: 1030,
          fontSize: copy.length > 42 ? 47 : 58,
          lineHeight: 1.45,
          fontWeight: 700,
          letterSpacing: "-1px",
        }}
      >
        {copy}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#8d8a82",
          fontSize: 25,
        }}
      >
        <span>{kind}</span>
        <span>kamesan.org</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
