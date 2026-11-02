import type { Report, Attachment } from './types';
import { cleanRecord, inferTopics, parseCSV, recordSignature } from './core';
import JSZip from './vendor/jszip.min';
const LIMIT = 20 * 1024 * 1024;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('berichtsheft-checker', 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('records')) req.result.createObjectStore('records', { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains('meta')) req.result.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Bitte andere Berichtsheft-Tabs schließen.'));
  });
}
export async function readReports(): Promise<Report[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records');
    const req = tx.objectStore('records').getAll();
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function saveReports(updates: Report[], deleted?: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    let error: Error | null = null;
    const req = store.getAll();
    req.onsuccess = () => {
      const merged = new Map<string, Report>(req.result.map((r: Report) => [r.id, r]));
      if (deleted) merged.delete(deleted);
      updates.forEach(r => merged.set(r.id, r));
      if ([...merged.values()].reduce((n, r) => n + r.attachments.reduce((s, a) => s + a.blob.size, 0), 0) > 100 * 1024 * 1024) {
        error = new Error('Maximal 100 MB Anhänge pro Archiv.'); tx.abort(); return;
      }
      if (deleted) store.delete(deleted);
      updates.forEach(r => store.put(r));
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(error ?? tx.error); };
  });
}
export async function attachment(file: File): Promise<Attachment> {
  if (!/\.(docx|doc|pdf|txt)$/i.test(file.name)) throw new Error('Bitte DOCX, DOC, PDF oder TXT auswählen.');
  if (file.size > LIMIT) throw new Error('Maximal 20 MB pro Datei.');
  return { id: crypto.randomUUID(), name: file.name, blob: file };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportBackup(records: Report[]) {
  const rows = await Promise.all(records.map(async r => ({ ...r, attachments: await Promise.all(r.attachments.map(async a => {
    const bytes = new Uint8Array(await a.blob.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { name: a.name, type: a.blob.type, data: btoa(binary) };
  })) })));
  download(new Blob([JSON.stringify({ format: 'berichtsheft-checker', version: 1, records: rows })], { type: 'application/json' }), 'berichtsheft-backup.json');
}
export async function importReports(files: File[], existing: Report[]): Promise<Report[]> {
  if (files.length > 50 || files.reduce((n, f) => n + f.size, 0) > 150 * 1024 * 1024) throw new Error('Maximal 50 Dateien / 150 MB pro Import.');
  const rows: Report[] = [], docs: Report[] = [];
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'json' && file.size > LIMIT) throw new Error('Maximal 20 MB pro Datei.');
    if (ext === 'json') {
      const data = JSON.parse(await file.text());
      if (data.format !== 'berichtsheft-checker' || data.version !== 1 || !Array.isArray(data.records) || data.records.length > 5000) throw new Error('Ungültiges Berichtsheft-Backup.');
      for (const raw of data.records) {
        const r: Report = { ...cleanRecord(raw), id: typeof raw.id === 'string' && /^(?:[a-f0-9-]{32,36}|bestand-2026-10-26-\d+)$/i.test(raw.id) ? raw.id : crypto.randomUUID(), attachments: [] };
        if (raw.attachments && !Array.isArray(raw.attachments)) throw new Error('Ungültige Anhänge.');
        for (const a of raw.attachments ?? []) {
          if (typeof a.data !== 'string' || a.data.length > LIMIT * 1.34 || typeof a.name !== 'string') throw new Error('Ungültiger Anhang.');
          const blob = new Blob([Uint8Array.from(atob(a.data), c => c.charCodeAt(0))], { type: typeof a.type === 'string' ? a.type : '' });
          if (blob.size > LIMIT) throw new Error('Anhang größer als 20 MB.');
          r.attachments.push({ id: crypto.randomUUID(), name: a.name.slice(0, 300), blob });
        }
        rows.push(r);
      }
    } else if (ext === 'csv') rows.push(...parseCSV(await file.text()).map(r => ({ ...cleanRecord(r), id: crypto.randomUUID() })));
    else {
      const a = await attachment(file); let heading = '';
      if (ext === 'txt') heading = (await file.text()).split(/\r?\n/).find(s => s.trim().length > 3)?.slice(0, 159) ?? '';
      if (ext === 'docx') {
        const entry = (await JSZip.loadAsync(file)).file('word/document.xml');
        if (!entry || (entry._data?.uncompressedSize ?? 0) > 5 * 1024 * 1024) throw new Error('Ungültige oder zu große DOCX-Datei.');
        const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('DOCX konnte nicht gelesen werden.');
        heading = [...xml.getElementsByTagNameNS('*', 'p')].map(p => [...p.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('').trim()).find(t => t.length > 3 && t.length < 160 && !/^(rückseitenbericht|name|datum|ausbildungsnachweis|sparkasse heidelberg)$/i.test(t)) ?? '';
      }
      docs.push({ ...cleanRecord({ topics: inferTopics(heading, file.name) }), id: crypto.randomUUID(), attachments: [a] });
    }
  }
  for (const doc of docs) {
    const name = doc.attachments[0].name.toLocaleLowerCase('de');
    const matches = [...rows, ...existing.filter(e => !rows.some(r => r.id === e.id))].filter(r => r.reference.split('|').some(n => n.trim().toLocaleLowerCase('de') === name));
    if (matches.length === 1) {
      const target = matches[0], updated = { ...target, attachments: [...target.attachments, ...doc.attachments] };
      const i = rows.findIndex(r => r.id === target.id); if (i >= 0) rows[i] = updated; else rows.push(updated);
    } else rows.push(doc);
  }
  const signatures = new Set(existing.map(recordSignature));
  const result = rows.filter(r => { const signature = recordSignature(r); if (signatures.has(signature)) return false; signatures.add(signature); return true; });
  if (result.reduce((n, r) => n + r.attachments.reduce((s, a) => s + a.blob.size, 0), 0) > 100 * 1024 * 1024) throw new Error('Maximal 100 MB Anhänge.');
  return result;
}
