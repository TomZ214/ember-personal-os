import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM for everything we persist in cookies (OAuth tokens, bank
 * requisition ids). The key comes from TOKEN_ENCRYPTION_KEY — any long random
 * string works; we hash it to exactly 32 bytes. Nothing is ever stored in
 * plaintext, and the httpOnly cookie never reaches client-side JS.
 */

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("TOKEN_ENCRYPTION_KEY missing or too short (min 16 chars). See SETUP.md.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString("base64url");
}

/** returns null on tampered/undecryptable input instead of throwing */
export function decrypt(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
