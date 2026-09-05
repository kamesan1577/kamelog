import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const postSchema = z
  .object({
    id: id.optional(),
    revision: z.number().int().nonnegative().optional(),
    kind: z.enum(["blog", "tweet", "vlog"]),
    title: z.string().max(300).default(""),
    body: z.string().max(100_000),
    tags: z.array(z.string().min(1).max(40)).max(20).default([]),
    pinned: z.boolean().default(false),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    video: z
      .string()
      .regex(/^\/api\/media\/[a-f0-9-]+$/)
      .optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.kind === "blog" && (!v.title.trim() || !v.body.trim()))
      c.addIssue({ code: "custom", message: "Title and body required" });
    if (v.kind === "tweet" && (!v.body.trim() || v.body.length > 5000))
      c.addIssue({ code: "custom", message: "Invalid tweet" });
    if (
      v.kind === "vlog" &&
      (!v.video || !v.time || v.body.length > 60 || /[\r\n]/.test(v.body))
    )
      c.addIssue({ code: "custom", message: "Invalid vlog" });
  });
export const draftSchema = z
  .object({
    id: id.optional(),
    revision: z.number().int().nonnegative().optional(),
    kind: z.enum(["blog", "tweet"]),
    title: z.string().max(300),
    body: z.string().max(100_000),
  })
  .strict();
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    bio: z.string().max(500),
    icon: z
      .string()
      .max(400_000)
      .refine((v) =>
        !v.startsWith("data:")
          ? v.length <= 20 && !/[<>]/.test(v)
          : /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v),
      ),
  })
  .strict();
export async function readBounded(request, limit = 1_000_000) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new RangeError("Payload too large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError("Payload too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
