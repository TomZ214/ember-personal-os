"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy, CreditCard, Eye, EyeOff, Images, KeyRound, Lock, LockOpen, Plus, ShieldCheck, StickyNote, Trash2,
} from "lucide-react";
import { decryptVault, deriveMediaKey, encryptVault, loadVaultBlob, saveVaultBlob } from "@/lib/crypto";
import { useT } from "@/lib/i18n";
import type { VaultEntry } from "@/lib/types";
import { MediaGallery } from "@/components/vault/MediaGallery";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const CATS = [
  { id: "logins", label: "Logins", icon: KeyRound },
  { id: "cards", label: "Cards", icon: CreditCard },
  { id: "notes", label: "Secure notes", icon: StickyNote },
] as const;

export default function VaultPage() {
  const t = useT();
  const [entries, setEntries] = useState<VaultEntry[] | null>(null); // null = locked
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [mediaKey, setMediaKey] = useState<CryptoKey | null>(null);
  const [cat, setCat] = useState<VaultEntry["category"] | "all" | "media">("all");
  const [adding, setAdding] = useState(false);

  const persist = async (next: VaultEntry[], pass: string) => {
    saveVaultBlob(await encryptVault(pass, JSON.stringify(next)));
    setEntries(next);
  };

  const lock = () => {
    setEntries(null);
    setPassphrase(null);
    setMediaKey(null);
    setCat("all");
    toast(t("vault.locked"), "info");
  };

  return (
    <div>
      <PageHeader
        title={t("vault.title")}
        sub={t("vault.sub")}
        actions={
          entries !== null ? (
            <>
              <Button onClick={lock}><Lock size={15} /> {t("vault.lock")}</Button>
              {cat !== "media" && (
                <Button variant="primary" onClick={() => setAdding(true)}><Plus size={16} /> {t("vault.addEntry")}</Button>
              )}
            </>
          ) : undefined
        }
      />

      {entries === null ? (
        <Gate onUnlock={(list, pass, mkey) => { setEntries(list); setPassphrase(pass); setMediaKey(mkey); }} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <CatChip label={t("vault.all")} active={cat === "all"} onClick={() => setCat("all")} />
            {CATS.map((c) => (
              <CatChip key={c.id} label={t(`vault.cat.${c.id}`)} active={cat === c.id} onClick={() => setCat(c.id)} />
            ))}
            <CatChip label={t("vault.photosVideos")} active={cat === "media"} onClick={() => setCat("media")} />
          </div>

          {cat === "media" ? (
            mediaKey && <MediaGallery mediaKey={mediaKey} />
          ) : entries.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={<ShieldCheck size={20} />}
                title={t("vault.empty")}
                hint={t("vault.emptyHint")}
                action={<Button variant="primary" onClick={() => setAdding(true)}>{t("vault.addFirst")}</Button>}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {entries
                  .filter((e) => cat === "all" || e.category === cat)
                  .map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      onDelete={() => passphrase && persist(entries.filter((x) => x.id !== e.id), passphrase)}
                    />
                  ))}
              </AnimatePresence>
            </div>
          )}

          <AddEntry
            open={adding}
            onClose={() => setAdding(false)}
            onAdd={(entry) => passphrase && persist([entry, ...entries], passphrase)}
          />
        </>
      )}
    </div>
  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
      }`}>
      {label}
    </button>
  );
}

/* ---------- gate: create or unlock ---------- */

function Gate({ onUnlock }: { onUnlock: (entries: VaultEntry[], pass: string, mediaKey: CryptoKey) => void }) {
  const t = useT();
  const [exists] = useState(() => typeof window !== "undefined" && !!loadVaultBlob());
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (pass.length < 6) return setError(t("vault.min6"));
    setBusy(true);
    try {
      if (exists) {
        const blob = loadVaultBlob()!;
        const plain = await decryptVault(pass, blob);
        onUnlock(JSON.parse(plain) as VaultEntry[], pass, await deriveMediaKey(pass));
        toast(t("vault.unlocked"));
      } else {
        if (pass !== confirm) {
          setError(t("vault.passNoMatch"));
          setBusy(false);
          return;
        }
        saveVaultBlob(await encryptVault(pass, "[]"));
        onUnlock([], pass, await deriveMediaKey(pass));
        toast(t("vault.createdRemember"));
      }
    } catch {
      setError(t("vault.wrongPass"));
    }
    setBusy(false);
  };

  return (
    <div className="flex justify-center pt-8">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="glass glass-edge relative w-full max-w-sm rounded-3xl p-7 text-center"
      >
        <motion.div
          animate={error ? { x: [0, -8, 8, -5, 5, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary-bright shadow-[0_0_28px_-4px_var(--primary-glow)]"
        >
          {exists ? <Lock size={22} /> : <LockOpen size={22} />}
        </motion.div>
        <h2 className="text-lg font-semibold tracking-tight">{exists ? t("vault.lockedTitle") : t("vault.createTitle")}</h2>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-[13px] leading-relaxed text-muted">
          {exists ? t("vault.enterPass") : t("vault.createDesc")}
        </p>
        <div className="mt-5 flex flex-col gap-3 text-left">
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (exists || confirm) && submit()}
            placeholder={t("vault.masterPass")}
            aria-label={t("vault.masterPass")}
            autoFocus
          />
          {!exists && (
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={t("vault.repeatPass")}
              aria-label={t("vault.repeatPass")}
            />
          )}
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <Button variant="primary" onClick={submit} disabled={busy || !pass} className="mt-1 w-full">
            {busy ? t("vault.deriving") : exists ? t("vault.unlock") : t("vault.createVault")}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------- entry card ---------- */

function EntryCard({ entry, onDelete }: { entry: VaultEntry; onDelete: () => void }) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const Icon = CATS.find((c) => c.id === entry.category)?.icon ?? KeyRound;

  const copy = async () => {
    await navigator.clipboard.writeText(entry.secret);
    toast(t("vault.copied"), "info");
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="panel panel-hover group p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-muted">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{entry.title}</p>
          {entry.username && <p className="truncate text-[13px] text-muted">{entry.username}</p>}
          {entry.url && <p className="truncate text-xs text-faint">{entry.url}</p>}
        </div>
        <button onClick={onDelete} aria-label={t("vault.deleteEntry")}
          className="rounded-lg p-1.5 text-faint opacity-0 transition-all hover:text-danger group-hover:opacity-100">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
        <code className="num min-w-0 flex-1 truncate font-mono text-[13px] tracking-wide">
          {revealed ? entry.secret : "••••••••••••"}
        </code>
        <button onClick={() => setRevealed(!revealed)} aria-label={revealed ? t("vault.hide") : t("vault.reveal")}
          className="rounded p-1 text-faint transition-colors hover:text-ink">
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button onClick={copy} aria-label={t("vault.copySecret")} className="rounded p-1 text-faint transition-colors hover:text-accent">
          <Copy size={14} />
        </button>
      </div>
    </motion.div>
  );
}

/* ---------- add entry ---------- */

function AddEntry({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (e: VaultEntry) => void }) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VaultEntry["category"]>("logins");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState("");

  const save = () => {
    if (!title.trim() || !secret) return;
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      category,
      username: username.trim(),
      secret,
      url: url.trim() || undefined,
    });
    toast(t("vault.entrySaved"));
    setTitle(""); setUsername(""); setSecret(""); setUrl("");
    onClose();
  };

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
    const arr = crypto.getRandomValues(new Uint32Array(20));
    setSecret(Array.from(arr, (n) => chars[n % chars.length]).join(""));
  };

  return (
    <Modal open={open} onClose={onClose} title={t("vault.newEntry")}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("vault.entryTitle")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("vault.titlePh")} autoFocus />
          </label>
          <label>
            <Label>{t("vault.category")}</Label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as VaultEntry["category"])}>
              {CATS.map((c) => <option key={c.id} value={c.id}>{t(`vault.cat.${c.id}`)}</option>)}
            </Select>
          </label>
        </div>
        <label>
          <Label>{t("vault.usernameDetail")}</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("vault.optional")} />
        </label>
        <label>
          <Label>{t("vault.secret")}</Label>
          <div className="flex gap-2">
            <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t("vault.secretPh")} className="font-mono" />
            <Button size="sm" onClick={generate} className="h-10 shrink-0">{t("vault.generate")}</Button>
          </div>
        </label>
        <label>
          <Label>{t("vault.url")}</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("vault.optional")} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim() || !secret}>{t("vault.encryptSave")}</Button>
        </div>
      </div>
    </Modal>
  );
}
