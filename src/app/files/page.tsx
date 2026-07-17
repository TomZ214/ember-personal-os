"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  Download, FileArchive, FileAudio, FileBox, FileCode, FileImage, FileText, FileVideo, File as FileIcon,
  Trash2, UploadCloud,
} from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { deleteBlob, getBlob, putBlob } from "@/lib/idb";
import type { FileMeta } from "@/lib/types";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

function iconFor(type: string, name: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideo;
  if (type.startsWith("audio/")) return FileAudio;
  if (type.includes("zip") || type.includes("compressed")) return FileArchive;
  if (/\.(ts|tsx|js|py|css|html|json|md)$/i.test(name)) return FileCode;
  if (type.includes("pdf") || type.startsWith("text/")) return FileText;
  return FileIcon;
}

const fmtSize = (b: number) =>
  b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : b > 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`;

export default function FilesPage() {
  const hydrated = useHydrated();
  const t = useT();
  const files = useEmber((s) => s.files);
  const addFile = useEmber((s) => s.addFile);
  const removeFile = useEmber((s) => s.deleteFile);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // build object-URL previews for images
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    (async () => {
      const map: Record<string, string> = {};
      for (const f of files.filter((f) => f.type.startsWith("image/"))) {
        const blob = await getBlob(f.id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          map[f.id] = url;
        }
      }
      if (alive) setPreviews(map);
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  const ingest = useCallback(
    async (list: FileList | File[]) => {
      for (const file of Array.from(list)) {
        if (file.size > 50 * 1_048_576) {
          toast(`"${file.name}" > 50 MB — ${t("files.skipped")}`, "info");
          continue;
        }
        const meta: FileMeta = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          addedAt: new Date().toISOString(),
        };
        await putBlob(meta.id, file);
        addFile(meta);
      }
      toast(t("files.uploadComplete"));
    },
    [addFile, t],
  );

  const download = async (f: FileMeta) => {
    const blob = await getBlob(f.id);
    if (!blob) return toast(t("files.dataMissing"), "info");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  const totalSize = files.reduce((a, f) => a + f.size, 0);

  return (
    <div>
      <PageHeader title={t("files.title")} sub={files.length ? `${files.length} ${t("files.count")} · ${fmtSize(totalSize)} ${t("files.stored")}` : t("files.sub")} />

      {/* dropzone */}
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) ingest(e.dataTransfer.files);
        }}
        className={`mb-6 flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-6 py-10 transition-all duration-200 ${
          dragOver ? "scale-[1.01] border-accent/60 bg-accent/[0.06]" : "border-white/[0.10] bg-white/[0.02] hover:border-white/[0.2] hover:bg-white/[0.04]"
        }`}
      >
        <motion.span animate={dragOver ? { y: [-2, 2, -2] } : {}} transition={{ repeat: Infinity, duration: 0.8 }}>
          <UploadCloud size={26} className={dragOver ? "text-accent" : "text-muted"} />
        </motion.span>
        <p className="text-sm font-medium">{dragOver ? t("files.dropToUpload") : t("files.dropHere")}</p>
        <p className="text-xs text-faint">{t("files.storedHint")}</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files?.length && ingest(e.target.files)}
        aria-label={t("files.uploadFiles")}
      />

      {files.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<FileBox size={20} />} title={t("files.none")} hint={t("files.noneHint")} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <AnimatePresence initial={false}>
            {files.map((f) => {
              const Icon = iconFor(f.type, f.name);
              const preview = previews[f.id];
              return (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="panel panel-hover group overflow-hidden"
                >
                  <div className="flex h-28 items-center justify-center overflow-hidden bg-white/[0.02]">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={f.name} className="h-full w-full object-cover" />
                    ) : (
                      <Icon size={30} strokeWidth={1.4} className="text-muted" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[13px] font-medium" title={f.name}>{f.name}</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {fmtSize(f.size)} · {formatDistanceToNow(parseISO(f.addedAt), { addSuffix: true })}
                    </p>
                    <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => download(f)} aria-label={`Download ${f.name}`}
                        className="flex-1 rounded-lg bg-white/[0.06] py-1.5 text-muted transition-colors hover:text-ink">
                        <Download size={14} className="mx-auto" />
                      </button>
                      <button
                        onClick={async () => { await deleteBlob(f.id); removeFile(f.id); toast(t("files.deleted"), "info"); }}
                        aria-label={`Delete ${f.name}`}
                        className="flex-1 rounded-lg bg-white/[0.06] py-1.5 text-muted transition-colors hover:text-danger"
                      >
                        <Trash2 size={14} className="mx-auto" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
