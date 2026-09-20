import { apiErrorMessage, networkErrorMessage } from "./api-error.mjs";

export async function api<T>(
  path: string,
  method = "GET",
  value?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(value === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
  } catch {
    throw new Error(networkErrorMessage);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? data.error
        : undefined;
    throw new Error(apiErrorMessage(response.status, message));
  }
  if (data === null)
    throw new Error("応答を読み取れませんでした。再試行してください。");
  return data as T;
}
export async function signIn() {
  const { startAuthentication } = await import("@simplewebauthn/browser");
  const optionsJSON = await api<
    Parameters<typeof startAuthentication>[0]["optionsJSON"]
  >("auth/login/options", "POST", {});
  const response = await startAuthentication({ optionsJSON });
  await api("auth/login/verify", "POST", response);
}
export async function registerPasskey(token: string) {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const optionsJSON = await api<
    Parameters<typeof startRegistration>[0]["optionsJSON"]
  >("auth/register/options", "POST", { token });
  const response = await startRegistration({ optionsJSON });
  await api("auth/register/verify", "POST", response);
}
