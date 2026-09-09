import { fetchLinkPreview } from "@/server/link-preview.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response(null, { status: 400 });
  try {
    const preview = await fetchLinkPreview(target);
    if (!preview) {
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "public, max-age=300" },
      });
    }
    return Response.json(preview, {
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "public, max-age=60" },
    });
  }
}
