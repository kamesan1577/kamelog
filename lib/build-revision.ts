const COMMIT_URL = "https://github.com/kamesan1577/kamelog/commit/";

export function buildRevision(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/i.test(value)) return null;

  const sha = value.toLowerCase();
  return {
    sha,
    shortSha: sha.slice(0, 7),
    url: `${COMMIT_URL}${sha}`,
  };
}
