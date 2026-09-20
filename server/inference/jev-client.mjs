import {
  InferenceUnavailable,
  abstainedParent,
  abstainedTags,
  classified,
  independent,
  linked,
} from "./ports.mjs";

const endpoint = "https://api.typesafe.ai/v1/decisions";
const timeoutMs = 8_000;

export class JevClient {
  constructor({ apiKey, fetchImpl = fetch, url = endpoint } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.url = url;
  }
  async decide(payload) {
    if (!this.apiKey) throw new InferenceUnavailable("not_configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.status === 429)
        throw new InferenceUnavailable("rate_limited");
      if (!response.ok) throw new InferenceUnavailable("remote_error");
      return await response.json();
    } catch (error) {
      if (error instanceof InferenceUnavailable) throw error;
      throw new InferenceUnavailable(
        error?.name === "AbortError" ? "timeout" : "network",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** All Jev request/response vocabulary is intentionally isolated in this file. */
export class JevTagInference {
  constructor(client) {
    this.client = client;
  }
  async inferTags({ post, candidates, context }) {
    if (!candidates.length) return abstainedTags();
    const value = await this.client.decide({
      state: { post, candidates, context },
      questions: [
        {
          type: "Choice",
          key: "tags",
          choices: candidates.map(({ tag }) => tag),
        },
      ],
    });
    const selected = value?.answers?.tags;
    const tags = (Array.isArray(selected) ? selected : [selected])
      .filter(
        (tag) =>
          typeof tag === "string" &&
          candidates.some((item) => item.tag === tag),
      )
      .map((tag) => ({ tag }));
    return tags.length ? classified(tags) : abstainedTags();
  }
}

export class JevThreadInference {
  constructor(client) {
    this.client = client;
  }
  async inferParent({ post, candidates }) {
    if (!candidates.length) return independent();
    const value = await this.client.decide({
      state: { post, candidates },
      questions: [
        {
          type: "Choice",
          key: "parent",
          choices: ["none", ...candidates.map(({ id }) => id)],
        },
      ],
    });
    const parentId = value?.answers?.parent;
    if (parentId === "none") return independent();
    return candidates.some((candidate) => candidate.id === parentId)
      ? linked(parentId)
      : abstainedParent();
  }
}
