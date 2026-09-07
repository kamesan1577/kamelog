import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Notebook, { PreviewShell } from "./notebook";
import { getStore } from "@/server/runtime.mjs";
import {
  blogStructuredData,
  ogImageUrl,
  postUrl,
  seoDescription,
  websiteStructuredData,
} from "@/server/seo.mjs";
import { socialCopy } from "@/lib/social";

export const dynamic = "force-dynamic";

type PageSearchParams = { embed?: string; preview?: string; post?: string };
type PublicPost = {
  id: string;
  kind: "blog" | "tweet" | "vlog";
  title: string;
  body: string;
  date: string;
  updatedAt?: string;
};

function StructuredData({ value }: { value: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const noIndex = params.preview === "1" || params.embed === "1";
  const id = params.post;
  if (!id) return noIndex ? { robots: { index: false, follow: false } } : {};

  const post = getStore().get("posts", id) as PublicPost | null;
  if (!post) return { robots: { index: false, follow: false } };

  const copy = socialCopy(post);
  const title = post.kind === "blog" ? post.title.trim() : copy;
  const description =
    post.kind === "blog" ? seoDescription(post.body) : copy;
  const image = ogImageUrl(post.id);
  const canonical = postUrl(post.id);
  const modified = post.updatedAt || post.date;
  const openGraph: Metadata["openGraph"] =
    post.kind === "blog"
      ? {
          title,
          description,
          siteName: "kamelog",
          type: "article",
          url: canonical,
          publishedTime: post.date,
          modifiedTime: modified,
          images: [{ url: image, width: 1200, height: 630, alt: title }],
        }
      : {
          title,
          description,
          siteName: "kamelog",
          type: "website",
          url: canonical,
          images: [{ url: image, width: 1200, height: 630, alt: title }],
        };

  return {
    title: `${title} | kamelog`,
    description,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    other: { "twitter:url": canonical },
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
  const posts = store.list("posts") as PublicPost[];
  const selectedPost = params.post
    ? posts.find((post) => post.id === params.post) || null
    : null;
  if (params.post && !selectedPost) notFound();

  const profile = store.get("settings", "profile");
  const structuredData = websiteStructuredData(profile) as Record<
    string,
    unknown
  >[];
  const blogData = blogStructuredData(selectedPost, profile) as Record<
    string,
    unknown
  > | null;
  if (blogData) structuredData.push(blogData);

  return (
    <>
      {structuredData.map((value, index) => (
        <StructuredData key={index} value={value} />
      ))}
      <Notebook
        initialPosts={posts}
        initialProfile={profile}
        initialSelected={params.post || null}
      />
    </>
  );
}
