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

/* ---------- binary media encryption ----------
   Photos/videos are far too large to travel in the synced vault blob, so
   they live encrypted in IndexedDB on this device only. To avoid running
   the 310k-iteration PBKDF2 for every single file, we derive ONE reusable
   AES key from the master passphrase and a persistent per-device salt, then
   encrypt each file with that key and a fresh random IV. */

const MEDIA_SALT_KEY = "ember-vault-media-salt";

function mediaSalt(): Uint8Array {
  let s = localStorage.getItem(MEDIA_SALT_KEY);
  if (!s) {
    s = b64(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(MEDIA_SALT_KEY, s);
  }
  return unb64(s);
}

/** derive the reusable media key from the vault's master passphrase */
export function deriveMediaKey(passphrase: string): Promise<CryptoKey> {
  return deriveKey(passphrase, mediaSalt());
}

export async function encryptBytes(key: CryptoKey, data: ArrayBuffer): Promise<{ iv: string; cipher: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data);
  return { iv: b64(iv), cipher };
}

export function decryptBytes(key: CryptoKey, ivB64: string, cipher: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) as BufferSource }, key, cipher);
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
