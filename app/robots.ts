import type { MetadataRoute } from "next";
import { siteOrigin } from "@/server/seo.mjs";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/setup"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
