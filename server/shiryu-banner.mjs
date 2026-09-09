const SHIRYU_ORIGIN = "https://shiryu.win";

function readAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

export function findShiryuBannerUrl(html) {
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
  let best = null;

  for (const tag of imageTags) {
    const src = readAttribute(tag, "src");
    if (!src) continue;

    const alt = readAttribute(tag, "alt");
    const title = readAttribute(tag, "title");
    const width = readAttribute(tag, "width");
    const height = readAttribute(tag, "height");

    let score = 0;
    if (/shiryu/i.test(`${alt} ${title}`)) score += 4;
    if (width === "200") score += 2;
    if (height === "40") score += 2;
    if (/banner|bnr/i.test(src)) score += 2;

    if (!best || score > best.score) best = { score, src };
  }

  if (!best || best.score < 4) return null;

  try {
    const url = new URL(best.src, `${SHIRYU_ORIGIN}/`);
    if (url.origin !== SHIRYU_ORIGIN) return null;
    return url.href;
  } catch {
    return null;
  }
}
