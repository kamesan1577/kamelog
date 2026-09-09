import { findShiryuBannerUrl } from "@/server/shiryu-banner.mjs";

const SHIRYU_HOME = "https://shiryu.win/";
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const ALLOWED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_BANNER_BYTES = 1024 * 1024;

export async function GET() {
  try {
    const page = await fetch(SHIRYU_HOME, {
      headers: {
        "user-agent": "kamelog/1.0 (+https://kamesan.org)",
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });

    if (!page.ok) return new Response(null, { status: 502 });

    const bannerUrl = findShiryuBannerUrl(await page.text());
    if (!bannerUrl) return new Response(null, { status: 404 });

    const banner = await fetch(bannerUrl, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });
    if (!banner.ok) return new Response(null, { status: 502 });

    const contentType = (banner.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return new Response(null, { status: 502 });
    }

    const bytes = await banner.arrayBuffer();
    if (bytes.byteLength > MAX_BANNER_BYTES) {
      return new Response(null, { status: 502 });
    }

    return new Response(bytes, {
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
