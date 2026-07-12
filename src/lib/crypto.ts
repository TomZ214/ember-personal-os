/**
 * Vault encryption: AES-256-GCM, key derived from the master passphrase
 * with PBKDF2 (310k iterations, per-vault random salt). The plaintext and
 * the derived key only ever live in memory.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface VaultBlob {
  salt: string;
  iv: string;
  data: string;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 310_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptVault(passphrase: string, plaintext: string): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(plaintext));
  return { salt: b64(salt), iv: b64(iv), data: b64(data) };
}

/** throws on a wrong passphrase (GCM auth failure) */
export async function decryptVault(passphrase: string, blob: VaultBlob): Promise<string> {
  const key = await deriveKey(passphrase, unb64(blob.salt));
  const data = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(blob.iv) as BufferSource },
    key,
    unb64(blob.data) as BufferSource,
  );
  return dec.decode(data);
}

export const VAULT_STORAGE_KEY = "ember-vault";

export function loadVaultBlob(): VaultBlob | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VaultBlob) : null;
  } catch {
    return null;
  }
}

export function saveVaultBlob(blob: VaultBlob) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(blob));
}
