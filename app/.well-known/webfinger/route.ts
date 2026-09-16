import { handleActivityPub } from "@/server/runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleActivityPub;
