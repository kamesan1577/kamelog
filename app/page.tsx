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

function SourceFooter() {
  return (
    <footer
      aria-label="kamelogの開発情報"
      className="site-source-footer border-t border-[#eceae5] px-5 pt-5 pb-24 text-xs text-[#858078] md:ml-[222px] md:px-10 md:pb-6"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-medium text-[#625e56]">kamelog の開発情報</span>
        <a
          className="underline underline-offset-4"
          href="https://github.com/kamesan1577/kamelog"
          target="_blank"
          rel="noreferrer"
        >
          ソースコード
        </a>
        <span aria-hidden="true">·</span>
        <a
          className="underline underline-offset-4"
          href="https://github.com/kamesan1577/kamelog/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          不具合・要望をIssueで報告
        </a>
      </div>
      <section
        className="site-mutual-links mx-auto mt-5 max-w-5xl border-t border-[#eceae5] pt-4"
        aria-labelledby="mutual-links-title"
      >
        <p id="mutual-links-title" className="mb-2 font-medium text-[#625e56]">
          相互リンク
        </p>
        <a
          className="shiryu-banner"
          href="https://shiryu.win/"
          target="_blank"
          rel="noreferrer"
          aria-label="Shiryu のホームページを開く"
        >
          Shiryu のホームページ
        </a>
      </section>
    </footer>
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
  const description = post.kind === "blog" ? seoDescription(post.body) : copy;
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
  const posts = store.list("posts");
  const selectedPost = params.post
    ? posts.find(({ id }: { id: string }) => id === params.post)
    : undefined;
  if (params.post && !selectedPost) notFound();

  const profile = store.get("settings", "profile");
  const structuredData = websiteStructuredData(profile) as Record<
    string,
    unknown
  >[];
  const blogData = blogStructuredData(selectedPost || null, profile) as Record<
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
      <SourceFooter />
    </>
  );
}
