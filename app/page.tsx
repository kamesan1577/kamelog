import Notebook, { PreviewShell } from "./notebook";
import { getStore } from "@/server/runtime.mjs";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string; preview?: string; post?: string }>;
}) {
  const params = await searchParams;
  if (process.env.NODE_ENV === "development" && params.preview === "1")
    return <PreviewShell />;
  const store = getStore();
  return (
    <Notebook
      initialPosts={store.list("posts")}
      initialProfile={store.get("settings", "profile")}
      initialSelected={params.post || null}
    />
  );
}
