import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { configuration } from "@/server/api.mjs";
import { getStore } from "@/server/runtime.mjs";
import { NotificationSettings } from "@/components/notification-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "サーバー通知 | kamelog",
  robots: { index: false, follow: false },
};

export default async function NotificationSettingsPage() {
  const sessionName = configuration().secure ? "__Host-kamelog-session" : "kamelog-session";
  const session = (await cookies()).get(sessionName)?.value;
  if (!getStore().authenticated(session)) redirect("/");
  return <NotificationSettings />;
}
