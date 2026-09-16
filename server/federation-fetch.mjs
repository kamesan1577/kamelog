import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { isPrivateAddress } from "./link-preview.mjs";

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REDIRECTS = 3;

function hostnameOf(url) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function normalizeFederationUrl(value, options = {}) {
  const url = new URL(value);
  const allowHttp = options.allowHttp === true;
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:"))
    throw new Error("federation URL must use HTTPS");
  if (url.username || url.password)
    throw new Error("federation URL must not contain credentials");
  const hostname = hostnameOf(url);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  )
    if (!options.allowPrivateNetwork) throw new Error("local host is blocked");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (
    !options.allowNonDefaultPort &&
    ((url.protocol === "https:" && port !== "443") ||
      (url.protocol === "http:" && port !== "80"))
  )
    throw new Error("non-default federation port is blocked");
  if (
    isIP(hostname) &&
    isPrivateAddress(hostname) &&
    !options.allowPrivateNetwork
  )
    throw new Error("private federation address is blocked");
  url.hash = "";
  return url;
}

export async function resolveFederationAddress(url, options = {}) {
  const hostname = hostnameOf(url);
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname) && !options.allowPrivateNetwork)
      throw new Error("private federation address is blocked");
    return { address: hostname, family: isIP(hostname) };
  }
  const resolve = options.lookup || dnsLookup;
  const addresses = await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("federation host did not resolve");
  if (
    !options.allowPrivateNetwork &&
    addresses.some(({ address }) => isPrivateAddress(address))
  )
    throw new Error("federation host resolved to a blocked address");
  return addresses[0];
}

function requestDocument(url, resolved, options) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          accept:
            options.accept ||
            'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/json;q=0.8',
          "user-agent": "kamelog-federation/1.0",
        },
        lookup: (_hostname, lookupOptions, callback) => {
          if (typeof lookupOptions === "object" && lookupOptions.all) {
            callback(null, [resolved]);
            return;
          }
          callback(null, resolved.address, resolved.family);
        },
        ...(url.protocol === "https:" ? { servername: hostnameOf(url) } : {}),
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume();
          resolve({ redirect: new URL(location, url).href });
          return;
        }
        const contentType = String(response.headers["content-type"] || "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (
          status < 200 ||
          status >= 300 ||
          !options.contentTypes.includes(contentType)
        ) {
          response.resume();
          reject(new Error("unexpected federation response"));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            request.destroy(new Error("federation response exceeded limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ body: Buffer.concat(chunks) }));
      },
    );
    request.setTimeout(options.timeoutMs, () =>
      request.destroy(new Error("federation request timed out")),
    );
    request.on("error", reject);
    request.end();
  });
}

export async function fetchFederationDocument(value, options = {}) {
  const settings = {
    allowHttp: options.allowHttp === true,
    allowPrivateNetwork: options.allowPrivateNetwork === true,
    allowNonDefaultPort: options.allowNonDefaultPort === true,
    lookup: options.lookup,
    maxBytes: options.maxBytes || DEFAULT_MAX_BYTES,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    contentTypes: options.contentTypes || [
      "application/activity+json",
      "application/ld+json",
      "application/json",
      "application/jrd+json",
    ],
    accept: options.accept,
  };
  let url = normalizeFederationUrl(value, settings);
  const request = options.request || requestDocument;
  for (let redirects = 0; redirects <= settings.maxRedirects; redirects += 1) {
    const resolved = await resolveFederationAddress(url, settings);
    const result = await request(url, resolved, settings);
    if (result.redirect) {
      if (redirects === settings.maxRedirects)
        throw new Error("too many federation redirects");
      url = normalizeFederationUrl(result.redirect, settings);
      continue;
    }
    return { body: result.body, url };
  }
  throw new Error("federation request failed");
}

export async function fetchFederationJson(value, options = {}) {
  const { body, url } = await fetchFederationDocument(value, options);
  return { value: JSON.parse(body.toString("utf8")), url };
}
