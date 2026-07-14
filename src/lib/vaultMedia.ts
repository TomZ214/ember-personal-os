/**
 * Encrypted media store for the vault — photos & videos.
 *
 * Bytes never leave this device: each file is AES-256-GCM encrypted with the
 * vault's media key (see crypto.ts) and stored in IndexedDB. Metadata lives in
 * a separate object store so the gallery can list items without loading every
 * (potentially huge) ciphertext into memory. Deliberately NOT cloud-synced.
 */

export interface MediaMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
  iv: string; // base64 GCM nonce for this item's ciphertext
}

const DB = "ember-vault-media";
const META = "meta";
const CIPHER = "cipher";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CIPHER)) db.createObjectStore(CIPHER);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMedia(meta: MediaMeta, cipher: ArrayBuffer): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META, CIPHER], "readwrite");
    tx.objectStore(META).put(meta);
    tx.objectStore(CIPHER).put(cipher, meta.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listMedia(): Promise<MediaMeta[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(META).objectStore(META).getAll();
    req.onsuccess = () => {
      const rows = (req.result as MediaMeta[]) ?? [];
      rows.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getCipher(id: string): Promise<ArrayBuffer | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(CIPHER).objectStore(CIPHER).get(id);
    req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META, CIPHER], "readwrite");
    tx.objectStore(META).delete(id);
    tx.objectStore(CIPHER).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
