import Notebook, { PreviewShell } from "./notebook";
import { getStore } from "@/server/runtime.mjs";
import { socialCopy } from "@/lib/social";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
type PageSearchParams = { embed?: string; preview?: string; post?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}): Promise<Metadata> {
  const { post: id } = await searchParams;
  const post = id ? getStore().get("posts", id) : null;
  if (!post) return {};
  const copy = socialCopy(post);
  const image = "/og?post=" + encodeURIComponent(post.id);
  const url = "/?post=" + encodeURIComponent(post.id);
  return {
    title: copy + " | kamelog",
    description: copy,
    alternates: { canonical: url },
    openGraph: {
      title: copy,
      description: copy,
      siteName: "kamelog",
      type: post.kind === "blog" ? "article" : "website",
      url,
      images: [{ url: image, width: 1200, height: 630, alt: copy }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy,
      description: copy,
      images: [image],
    },
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  if (process.env.NODE_ENV === "development" && params.preview === "1")
    return <PreviewShell />;
  const store = getStore();
  return (
    <Notebook
      initialPosts={store.list("posts")}
      initialProfile={store.get("settings", "profile")}
      initialSelected={params.post || null}
    />
  );
}
