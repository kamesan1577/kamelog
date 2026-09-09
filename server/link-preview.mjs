import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

const MAX_HTML_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 256;
const cache = new Map();
const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

function decodeCodePoint(match, raw, radix) {
  const code = Number.parseInt(raw, radix);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : match;
}

function decodeHtml(value = "") {
  return value
    .replace(/&#(\d+);/g, (match, code) => decodeCodePoint(match, code, 10))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) =>
      decodeCodePoint(match, code, 16),
    )
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function attribute(tag, name) {
  const quoted = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"),
  );
  if (quoted) return decodeHtml(quoted[2].trim());
  const unquoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted ? decodeHtml(unquoted[1].trim()) : "";
}

function bareHostname(hostname) {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function isPrivateAddress(address) {
  const family = isIP(address);
  if (family === 4) return blockedAddresses.check(address, "ipv4");
  if (family === 6) return blockedAddresses.check(address, "ipv6");
  return true;
}

export function normalizePreviewUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("unsupported protocol");
  }
  if (url.username || url.password) {
    throw new Error("credentials are not allowed");
  }
  const hostname = bareHostname(url.hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("local hostnames are not allowed");
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error("private address is not allowed");
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (
    (url.protocol === "https:" && port !== "443") ||
    (url.protocol === "http:" && port !== "80")
  ) {
    throw new Error("non-default ports are not allowed");
  }
  url.hash = "";
  return url;
}

function safeHttpUrl(value, base) {
  if (!value) return null;
  try {
    const candidate = normalizePreviewUrl(new URL(value, base).href);
    const parent = new URL(base);
    if (parent.protocol === "https:" && candidate.protocol !== "https:") {
      return null;
    }
    return candidate.href;
  } catch {
    return null;
  }
}

export function parsePreviewMetadata(html, pageUrl) {
  const meta = new Map();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (
      attribute(tag, "property") || attribute(tag, "name")
    ).toLowerCase();
    const content = attribute(tag, "content");
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title =
    meta.get("og:title") ||
    meta.get("twitter:title") ||
    decodeHtml(titleTag?.replace(/<[^>]*>/g, "").trim() || "");
  const description =
    meta.get("og:description") ||
    meta.get("twitter:description") ||
    meta.get("description") ||
    "";
  const image = safeHttpUrl(
    meta.get("og:image:secure_url") ||
      meta.get("og:image") ||
      meta.get("twitter:image") ||
      meta.get("twitter:image:src"),
    pageUrl,
  );
  let hostname = "";
  try {
    hostname = bareHostname(new URL(pageUrl).hostname);
  } catch {
    hostname = "";
  }
  const siteName = meta.get("og:site_name") || hostname;
  if (!title && !description && !image) return null;
  return {
    url: pageUrl,
    title: title.slice(0, 240),
    description: description.slice(0, 500),
    image,
    siteName: siteName.slice(0, 120),
  };
}

async function publicAddress(url) {
  const hostname = bareHostname(url.hostname);
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("private address is not allowed");
    }
    return { address: hostname, family: isIP(hostname) };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error("hostname did not resolve to public addresses only");
  }
  return addresses[0];
}

function requestHtml(url, resolved) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9",
          "user-agent": "kamelog-link-preview/1.0",
        },
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, [
              { address: resolved.address, family: resolved.family },
            ]);
            return;
          }
          callback(null, resolved.address, resolved.family);
        },
        ...(url.protocol === "https:"
          ? { servername: bareHostname(url.hostname) }
          : {}),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume();
          resolve({ redirect: new URL(location, url).href });
          return;
        }
        const contentType = String(
          response.headers["content-type"] || "",
        ).toLowerCase();
        if (
          status < 200 ||
          status >= 300 ||
          (!contentType.includes("text/html") &&
            !contentType.includes("application/xhtml+xml"))
        ) {
          response.resume();
          reject(new Error("preview response was not html"));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_HTML_BYTES) {
            request.destroy(new Error("preview html exceeded limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ html: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () =>
      request.destroy(new Error("preview request timed out")),
    );
    request.on("error", reject);
    request.end();
  });
}

async function loadPreview(initialUrl) {
  let url = normalizePreviewUrl(initialUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const resolved = await publicAddress(url);
    const result = await requestHtml(url, resolved);
    if (result.redirect) {
      if (redirects === MAX_REDIRECTS) {
        throw new Error("too many redirects");
      }
      url = normalizePreviewUrl(result.redirect);
      continue;
    }
    return parsePreviewMetadata(result.html, url.href);
  }
  return null;
}

function cacheSet(key, preview) {
  cache.set(key, { preview, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
}

export async function fetchLinkPreview(value) {
  const normalized = normalizePreviewUrl(value).href;
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.preview;
  if (cached) cache.delete(normalized);
  const preview = await loadPreview(normalized);
  cacheSet(normalized, preview);
  return preview;
}
