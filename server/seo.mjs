const PRODUCTION_ORIGIN = "https://kamesan.org";
const SITE_DESCRIPTION = "ブログ、つぶやき、vlogをまとめる個人サイト。";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function siteOrigin(env = process.env) {
  const raw = String(env.KAMELOG_ORIGIN || PRODUCTION_ORIGIN).trim();
  const parsed = new URL(raw);
  if (
    parsed.origin !== raw ||
    parsed.username ||
    parsed.password ||
    !["http:", "https:"].includes(parsed.protocol)
  )
    throw new Error("Invalid public origin");
  if (env.NODE_ENV === "production" && LOOPBACK_HOSTS.has(parsed.hostname))
    return PRODUCTION_ORIGIN;
  return parsed.origin;
}

export function homeUrl(env = process.env) {
  return new URL("/", siteOrigin(env)).toString();
}

export function postUrl(id, env = process.env) {
  const url = new URL("/", siteOrigin(env));
  url.searchParams.set("post", String(id));
  return url.toString();
}

export function ogImageUrl(id, env = process.env) {
  const url = new URL("/og", siteOrigin(env));
  if (id) url.searchParams.set("post", String(id));
  return url.toString();
}

function plainText(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[#>*+-]+\s*/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function seoDescription(body, limit = 160) {
  const text = plainText(body) || SITE_DESCRIPTION;
  const characters = Array.from(text);
  return characters.length <= limit
    ? text
    : characters
        .slice(0, limit - 1)
        .join("")
        .trimEnd() + "…";
}

export function websiteStructuredData(profile, env = process.env) {
  const home = homeUrl(env);
  const personId = `${home}#person`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${home}#website`,
      url: home,
      name: "kamelog",
      description: SITE_DESCRIPTION,
      inLanguage: "ja",
      author: { "@id": personId },
    },
    {
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": personId,
      name: profile?.name || "かめさん",
      url: home,
      sameAs: ["https://github.com/kamesan1577"],
    },
  ];
}

export function blogStructuredData(post, profile, env = process.env) {
  if (!post || post.kind !== "blog") return null;
  const canonical = postUrl(post.id, env);
  const published = post.date;
  const modified = post.updatedAt || published;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: String(post.title || "").trim(),
    description: seoDescription(post.body),
    datePublished: published,
    dateModified: modified,
    author: {
      "@type": "Person",
      "@id": `${homeUrl(env)}#person`,
      name: profile?.name || "かめさん",
      url: homeUrl(env),
    },
    mainEntityOfPage: canonical,
    url: canonical,
    image: [ogImageUrl(post.id, env)],
  };
}
