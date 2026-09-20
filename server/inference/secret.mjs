import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function keyFrom(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const key = Buffer.from(value, "base64url");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function inferenceSecretBox(value) {
  const key = keyFrom(value);
  if (!key) return null;
  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv(algorithm, key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      return JSON.stringify({
        v: 1,
        iv: iv.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
      });
    },
    decrypt(payload) {
      const parsed = JSON.parse(payload);
      if (parsed?.v !== 1) throw new Error("Invalid encrypted credential");
      const decipher = createDecipheriv(
        algorithm,
        key,
        Buffer.from(parsed.iv, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
