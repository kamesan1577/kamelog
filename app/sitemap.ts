import type { MetadataRoute } from "next";
import { getStore } from "@/server/runtime.mjs";
import { homeUrl, postUrl } from "@/server/seo.mjs";

export const dynamic = "force-dynamic";

type SitemapPost = {
  id: string;
  kind: "blog" | "tweet" | "vlog";
  date?: string;
  updatedAt?: string;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getStore().list("posts") as SitemapPost[];
  return [
    { url: homeUrl() },
    ...posts
      .filter((post) => post.kind === "blog")
      .map((post) => ({
        url: postUrl(post.id),
        ...(post.updatedAt || post.date
          ? { lastModified: post.updatedAt || post.date }
          : {}),
      })),
  ];
}
