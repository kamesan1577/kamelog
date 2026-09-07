type SocialPost = {
  kind: "blog" | "tweet" | "vlog";
  title: string;
  body: string;
};

const MAX_SOCIAL_COPY = 72;

function plainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[#>*+-]+\s*/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, limit = MAX_SOCIAL_COPY) {
  const characters = Array.from(value);
  return characters.length <= limit
    ? value
    : characters
        .slice(0, limit - 1)
        .join("")
        .trimEnd() + "…";
}

export function socialCopy(post: SocialPost) {
  if (post.kind === "blog" && post.title.trim())
    return truncate(post.title.trim());
  const text = plainText(post.body);
  if (!text) return "kamelog";
  const first = Array.from(
    new Intl.Segmenter("ja", { granularity: "sentence" }).segment(text),
  )[0]?.segment;
  return truncate(first || text);
}

export function shouldAutoplayVlog(duration: number) {
  return Number.isFinite(duration) && duration > 0 && duration <= 10;
}
