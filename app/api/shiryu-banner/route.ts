import { findShiryuBannerUrl } from "@/server/shiryu-banner.mjs";

const SHIRYU_HOME = "https://shiryu.win/";
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

export async function GET() {
  try {
    const page = await fetch(SHIRYU_HOME, {
      headers: {
        "user-agent": "kamelog/1.0 (+https://kamesan.org)",
      },
      next: { revalidate: 86400 },
    });

    if (!page.ok) return new Response(null, { status: 502 });

    const bannerUrl = findShiryuBannerUrl(await page.text());
    if (!bannerUrl) return new Response(null, { status: 404 });

    const banner = await fetch(bannerUrl, {
      next: { revalidate: 86400 },
    });
    if (!banner.ok) return new Response(null, { status: 502 });

    const contentType = banner.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return new Response(null, { status: 502 });
    }

    return new Response(await banner.arrayBuffer(), {
      headers: {
        "cache-control": CACHE_CONTROL,
        "content-type": contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
