import { storageErrorCodes, type StorageErrorCode } from "./errors.ts";

/** Interpret fixed provider codes, never display a provider's response body. */
export function storageHttpError(
  status: number,
  responseBody: string,
): StorageErrorCode | undefined {
  if (status < 400) return;
  if (status === 429 || status === 507) return "storage_limit";
  const text = responseBody.slice(0, 16_384);
  // Workers Free may reject the request before our gateway runs and return
  // Cloudflare's HTML Error 1027 page instead of the application's JSON.
  if (
    /\berror(?:\s+code)?\s*[:#]?\s*1027\b/i.test(text.replace(/<[^>]*>/g, " "))
  )
    return "storage_limit";
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && "code" in value)
      for (const code of storageErrorCodes)
        if (value.code === code) return code;
  } catch {
    // A non-JSON error page is handled by its status without reflecting it.
  }
  if (status === 401 || status === 403) return "storage_configuration";
  if (status === 409) return "storage_conflict";
  if (status === 423) return "storage_migrating";
}
