export async function api<T>(
  path: string,
  method = "GET",
  value?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作に失敗しました。");
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
