import type { MetadataRoute } from "next";
import { getStore } from "@/server/runtime.mjs";
import { homeUrl, postUrl } from "@/server/seo.mjs";

export const dynamic = "force-dynamic";

type SitemapPost = {
  id: string;
  date?: string;
  updatedAt?: string;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getStore().sitemapPosts() as SitemapPost[];
  const home = homeUrl();
  return [
    { url: home },
    { url: new URL("/timeline", home).toString() },
    { url: new URL("/projects", home).toString() },
    { url: new URL("/federation", home).toString() },
    ...posts.map((post) => ({
      url: postUrl(post.id),
      ...(post.updatedAt || post.date
        ? { lastModified: post.updatedAt || post.date }
        : {}),
    })),
  ];
}
