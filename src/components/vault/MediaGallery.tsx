"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Download, Eye, EyeOff, ImageOff, Loader2, Play, Trash2, UploadCloud, X } from "lucide-react";
import { createPortal } from "react-dom";
import { decryptBytes, encryptBytes } from "@/lib/crypto";
import { deleteMedia, getCipher, listMedia, putMedia, type MediaMeta } from "@/lib/vaultMedia";
import { useLang, useT } from "@/lib/i18n";
import { dfLocale } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const MAX = 100 * 1_048_576; // 100 MB per file — keeps IndexedDB happy

const fmtSize = (b: number) =>
  b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : b > 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`;

/** Encrypted photos & videos — decrypted only in memory, never synced. */
export function MediaGallery({ mediaKey }: { mediaKey: CryptoKey }) {
  const t = useT();
  const lang = useLang();
  const [items, setItems] = useState<MediaMeta[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // Privacy blur. Starts ON every single time and is deliberately NOT
  // persisted: leaving the gallery, locking the vault or reloading all put the
  // blur back, the same way the vault itself re-locks. Revealing is always a
  // conscious act.
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewer, setViewer] = useState<{ meta: MediaMeta; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setItems(await listMedia());
  }, []);

  // initial load reads IndexedDB directly rather than going through refresh(),
  // so the state update is guarded by `alive` — the gallery can be unmounted
  // (vault re-locked, tab switched) while the read is still in flight.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const media = await listMedia();
      if (alive) setItems(media);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // decrypt image thumbnails into object URLs (videos get a poster tile instead)
  useEffect(() => {
    if (!items) return;
    let alive = true;
    const urls: string[] = [];
    (async () => {
      const map: Record<string, string> = {};
      for (const m of items.filter((m) => m.type.startsWith("image/"))) {
        try {
          const cipher = await getCipher(m.id);
          if (!cipher) continue;
          const plain = await decryptBytes(mediaKey, m.iv, cipher);
          const url = URL.createObjectURL(new Blob([plain], { type: m.type }));
          urls.push(url);
          map[m.id] = url;
        } catch {
          // wrong key / corrupt item — skip its thumbnail
        }
      }
      if (alive) setThumbs(map);
      else urls.forEach((u) => URL.revokeObjectURL(u));
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [items, mediaKey]);

  const ingest = useCallback(
    async (list: FileList | File[]) => {
      setBusy(true);
      try {
        for (const file of Array.from(list)) {
          if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
            toast(t("vault.notMedia").replace("{name}", file.name), "info");
            continue;
          }
          if (file.size > MAX) {
            toast(t("vault.overMax").replace("{name}", file.name), "info");
            continue;
          }
          const buf = await file.arrayBuffer();
          const { iv, cipher } = await encryptBytes(mediaKey, buf);
          await putMedia(
            {
              id: crypto.randomUUID(),
              name: file.name,
              type: file.type,
              size: file.size,
              addedAt: new Date().toISOString(),
              iv,
            },
            cipher,
          );
        }
        await refresh();
        toast(t("vault.savedEncrypted"));
      } finally {
        setBusy(false);
      }
    },
    [mediaKey, refresh, t],
  );

  const openViewer = async (m: MediaMeta) => {
    try {
      const cipher = await getCipher(m.id);
      if (!cipher) return toast(t("vault.dataMissing"), "info");
      const plain = await decryptBytes(mediaKey, m.iv, cipher);
      setViewer({ meta: m, url: URL.createObjectURL(new Blob([plain], { type: m.type })) });
    } catch {
      toast(t("vault.decryptFailed"), "error");
    }
  };

  const closeViewer = () => {
    if (viewer) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };

  const download = async (m: MediaMeta) => {
    try {
      const cipher = await getCipher(m.id);
      if (!cipher) return toast(t("vault.dataMissing"), "info");
      const plain = await decryptBytes(mediaKey, m.iv, cipher);
      const url = URL.createObjectURL(new Blob([plain], { type: m.type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = m.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast(t("vault.decryptFailed"), "error");
    }
  };

  const remove = async (m: MediaMeta) => {
    await deleteMedia(m.id);
    await refresh();
    toast(t("vault.deletedMedia"), "info");
  };

  return (
    <div>
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
        }}
        className={`mb-5 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 transition-all duration-200 ${
          dragOver
            ? "scale-[1.01] border-accent/60 bg-accent/[0.06]"
            : "border-white/[0.10] bg-white/[0.02] hover:border-white/[0.2] hover:bg-white/[0.04]"
        }`}
      >
        {busy ? <Loader2 size={24} className="animate-spin text-accent" /> : <UploadCloud size={24} className={dragOver ? "text-accent" : "text-muted"} />}
        <p className="text-sm font-medium">{busy ? t("vault.encrypting") : t("vault.dropMedia")}</p>
        <p className="text-xs text-faint">{t("vault.mediaHint")}</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files?.length && ingest(e.target.files)}
        aria-label={t("vault.addMedia")}
      />

      {items === null ? (
        <div className="skeleton h-40" style={{ borderRadius: 18 }} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<ImageOff size={20} />} title={t("vault.noMedia")} hint={t("vault.noMediaHint")} />
        </div>
      ) : (
        <>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            {t("vault.mediaCount").replace("{n}", String(items.length))}
            {!revealed && <span className="ml-2 text-xs text-faint">· {t("vault.blurredHint")}</span>}
          </p>
          <Button
            size="sm"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={!revealed}
            title={revealed ? t("vault.blurMedia") : t("vault.revealMedia")}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            {revealed ? t("vault.blurMedia") : t("vault.revealMedia")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence initial={false}>
            {items.map((m) => {
              const isVideo = m.type.startsWith("video/");
              const thumb = thumbs[m.id];
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="panel panel-hover group overflow-hidden"
                >
                  <button onClick={() => openViewer(m)} className="relative flex h-28 w-full items-center justify-center overflow-hidden bg-black/30" aria-label={t("vault.openMedia").replace("{name}", m.name)}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={revealed ? m.name : ""}
                        draggable={false}
                        // Inline rather than a CSS class: this tile lives inside
                        // a Framer `layout` motion.div, which drives transforms
                        // in its subtree and left a class-based filter/transform
                        // transition stuck at 0. Inline styles win outright.
                        // both branches set both properties explicitly — handing
                        // React `undefined` here left the old blur in place
                        style={
                          revealed
                            ? { filter: "none", transform: "none" }
                            : { filter: "blur(26px) saturate(1.15)", transform: "scale(1.15)" }
                        }
                        // No transition on purpose. A CSS transition here never
                        // progressed inside Framer's `layout` subtree (it froze
                        // at the old value), and fading a privacy blur would
                        // show the photo for the length of the fade anyway.
                        className="h-full w-full object-cover select-none"
                      />
                    ) : (
                      <Play size={26} className="text-muted" />
                    )}
                    {isVideo && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                          <Play size={16} fill="currentColor" />
                        </span>
                      </span>
                    )}
                  </button>
                  <div className="p-2.5">
                    <p className="truncate text-[13px] font-medium" title={m.name}>{m.name}</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {fmtSize(m.size)} · {formatDistanceToNow(parseISO(m.addedAt), { addSuffix: true, locale: dfLocale(lang) })}
                    </p>
                    <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => download(m)} aria-label={t("vault.downloadMedia").replace("{name}", m.name)} className="flex-1 rounded-lg bg-white/[0.06] py-1.5 text-muted transition-colors hover:text-ink">
                        <Download size={14} className="mx-auto" />
                      </button>
                      <button onClick={() => remove(m)} aria-label={t("vault.deleteMedia").replace("{name}", m.name)} className="flex-1 rounded-lg bg-white/[0.06] py-1.5 text-muted transition-colors hover:text-danger">
                        <Trash2 size={14} className="mx-auto" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        </>
      )}

      {viewer && <Lightbox viewer={viewer} onClose={closeViewer} />}
    </div>
  );
}

function Lightbox({ viewer, onClose }: { viewer: { meta: MediaMeta; url: string }; onClose: () => void }) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-[6px]" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="relative flex max-h-[90dvh] max-w-3xl flex-col"
      >
        <button onClick={onClose} aria-label={t("vault.close")} className="absolute -top-2 -right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black">
          <X size={18} />
        </button>
        {viewer.meta.type.startsWith("video/") ? (
          <video src={viewer.url} controls autoPlay className="max-h-[90dvh] rounded-2xl" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewer.url} alt={viewer.meta.name} className="max-h-[90dvh] rounded-2xl object-contain" />
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
