"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { format, isToday, parseISO } from "date-fns";
import {
  AlertOctagon, Archive, ArchiveRestore, CheckCheck, ChevronLeft, CornerUpLeft, CornerUpRight,
  Eraser, FileText, Inbox, Loader2, Mail as MailIcon, MailOpen, Paperclip, PenLine, RefreshCw,
  Search, Send, Sparkles, Star, Trash2, X,
} from "lucide-react";
import { CleanupTool } from "./CleanupTool";
import { useApi, invalidateApi } from "@/hooks/useApi";
import { markSynced } from "@/hooks/useIntegrations";
import type { GmailBox, GmailDetail, GmailHeader, GmailSendInput } from "@/lib/integrations/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const BOXES: { id: GmailBox; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "spam", label: "Spam", icon: AlertOctagon },
  { id: "trash", label: "Trash", icon: Trash2 },
];

/**
 * A connected mailbox provider. Both accounts render through the same
 * component — endpoints and capabilities differ, the experience doesn't.
 */
export interface MailProvider {
  key: "gmail" | "icloud";
  name: string;
  base: string;
  /** Gmail's bulk cleanup tool needs label/category search — Gmail only */
  canCleanup: boolean;
  reconnectHint: string;
}

export const GMAIL_PROVIDER: MailProvider = {
  key: "gmail",
  name: "Gmail",
  base: "/api/google/gmail",
  canCleanup: true,
  reconnectHint: "Your Google session needs to be renewed — reconnect in Settings → Connections.",
};

export const ICLOUD_PROVIDER: MailProvider = {
  key: "icloud",
  name: "iCloud",
  base: "/api/icloud/mail",
  canCleanup: false,
  reconnectHint: "iCloud rejected the sign-in — renew the app-specific password in Settings → Connections.",
};

interface ComposeSeed {
  to?: string;
  subject?: string;
  body?: string;
  threadId?: string;
  inReplyTo?: string;
}

export function GmailApp({ provider = GMAIL_PROVIDER }: { provider?: MailProvider }) {
  const params = useSearchParams();
  const [box, setBox] = useState<GmailBox>("inbox");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeId, setActiveId] = useState<string | null>(params.get("id"));
  const [compose, setCompose] = useState<ComposeSeed | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "read">(params.get("id") ? "read" : "list");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const listUrl = `${provider.base}?box=${box}${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`;
  const list = useApi<{ messages: GmailHeader[]; unreadInbox: number }>(listUrl, { refreshMs: 90_000 });

  useEffect(() => {
    if (list.data) markSynced(provider.key);
  }, [list.data, provider.key]);

  const detail = useApi<GmailDetail>(activeId ? `${provider.base}/message?id=${activeId}&box=${box}` : null);
  const ai = useApi<{ configured: boolean }>("/api/ai");

  const act = async (id: string, action: string, note?: string) => {
    const res = await fetch(`${provider.base}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, box }),
    });
    if (!res.ok) {
      toast((await res.json()).error ?? "Action failed", "info");
      return false;
    }
    if (note) toast(note, "info");
    invalidateApi(provider.base);
    await list.refresh();
    return true;
  };

  const openMail = (m: GmailHeader) => {
    setActiveId(m.id);
    setMobilePane("read");
    if (m.unread) void act(m.id, "read");
  };

  const unread = list.data?.unreadInbox ?? 0;
  const active = detail.data && detail.data.id === activeId ? detail.data : null;
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [readAll, setReadAll] = useState<{ total: number; done: number; running: boolean } | null>(null);
  const cancelReadAll = useRef(false);

  /**
   * Read-all over the whole mailbox: the server marks ≤1000 per call and
   * reports what's left; we loop with retries until zero remain. Runs in the
   * background — the rest of the app stays fully usable.
   */
  const runReadAll = async () => {
    cancelReadAll.current = false;
    const startedAt = Date.now();
    let done = 0;
    let failures = 0;
    setReadAll({ total: Math.max(unread, 1), done: 0, running: true });

    while (!cancelReadAll.current) {
      try {
        const res = await fetch(`${provider.base}/read-all`, { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "failed");
        done += body.marked;
        failures = 0;
        setReadAll((s) => (s ? { ...s, done, total: Math.max(s.total, done + body.remaining) } : s));
        if (body.remaining === 0 || body.marked === 0) break;
        await new Promise((r) => setTimeout(r, 300)); // quota-friendly pacing
      } catch (e) {
        failures++;
        if (failures >= 3) {
          toast(e instanceof Error ? e.message : "Read all failed — progress is saved, run it again to continue", "info");
          break;
        }
        await new Promise((r) => setTimeout(r, 1000 * failures));
      }
    }

    setReadAll((s) => (s ? { ...s, running: false } : s));
    invalidateApi(provider.base);
    await list.refresh();
    const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    toast(
      done === 0
        ? "Nothing was unread"
        : `${done.toLocaleString("en")} email${done === 1 ? "" : "s"} marked as read in ${secs}s${cancelReadAll.current ? " (cancelled)" : ""}`,
    );
    setTimeout(() => setReadAll(null), 4000);
  };

  if (list.errorStatus === 401) {
    return (
      <div>
        <PageHeader title="Mail" />
        <div className="panel">
          <EmptyState
            icon={<MailIcon size={20} />}
            title={`${provider.name} access expired`}
            hint={provider.reconnectHint}
            action={
              provider.key === "gmail" ? (
                <Button variant="primary" onClick={() => (window.location.href = "/api/google/auth")}>Reconnect Google</Button>
              ) : (
                <Button variant="primary" onClick={() => (window.location.href = "/settings/connections")}>Open Connections</Button>
              )
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Mail"
        sub={list.data ? (unread ? `${unread.toLocaleString("en")} unread · ${provider.name} connected` : "Inbox zero — enjoy it") : `Connecting to ${provider.name}…`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => list.refresh()} aria-label="Sync now" title="Sync now">
              {list.loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </Button>
            {provider.canCleanup && (
              <Button size="sm" variant="ghost" onClick={() => setCleanupOpen(true)} aria-label="Clean up old mail" title="Clean up old mail">
                <Eraser size={15} />
              </Button>
            )}
            {readAll ? (
              <div className="relative flex h-8 items-center gap-2 overflow-hidden rounded-[9px] border border-white/[0.08] bg-white/[0.04] px-3">
                <span
                  className="absolute inset-y-0 left-0 bg-accent/12 transition-[width] duration-500"
                  style={{ width: `${Math.min(100, (readAll.done / Math.max(1, readAll.total)) * 100)}%` }}
                  aria-hidden
                />
                {readAll.running ? (
                  <Loader2 size={13} className="relative shrink-0 animate-spin text-accent" />
                ) : (
                  <CheckCheck size={13} className="relative shrink-0 text-success" />
                )}
                <span className="num relative whitespace-nowrap text-xs font-medium">
                  {readAll.done.toLocaleString("en")} / {readAll.total.toLocaleString("en")} read
                </span>
                {readAll.running && (
                  <button
                    onClick={() => {
                      cancelReadAll.current = true;
                    }}
                    aria-label="Cancel read all"
                    className="relative shrink-0 text-faint transition-colors hover:text-ink"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ) : (
              unread > 0 && (
                <Button size="sm" onClick={runReadAll} title="Mark every unread email as read">
                  <CheckCheck size={14} />
                  Read all
                </Button>
              )
            )}
            <Button variant="primary" onClick={() => setCompose({})}>
              <PenLine size={15} /> Compose
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {BOXES.map((b) => {
          const Icon = b.icon;
          const activeBox = box === b.id;
          return (
            <button
              key={b.id}
              onClick={() => { setBox(b.id); setMobilePane("list"); }}
              aria-pressed={activeBox}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                activeBox ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
              }`}
            >
              <Icon size={13} />
              {b.label}
              {b.id === "inbox" && unread > 0 && (
                <span className="num rounded-full bg-primary px-1.5 text-[10px] font-semibold text-(--on-sunset)">{unread}</span>
              )}
            </button>
          );
        })}
        <div className="relative ml-auto w-full sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${provider.name}…`} className="h-9 pl-9" aria-label="Search mail" />
        </div>
      </div>

      <div className="flex h-[calc(100dvh-19rem)] min-h-[26rem] gap-4">
        {/* list */}
        <div className={`w-full flex-col md:flex md:w-96 md:shrink-0 ${mobilePane === "list" ? "flex" : "hidden"}`}>
          <div className="panel flex-1 divide-y divide-white/[0.05] overflow-y-auto">
            {!list.data && !list.error && (
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i}>
                    <div className="skeleton h-4 w-2/3" />
                    <div className="skeleton mt-1.5 h-3 w-full" />
                  </div>
                ))}
              </div>
            )}
            {list.error && list.errorStatus !== 401 && (
              <EmptyState icon={<MailIcon size={20} />} title="Couldn't load mail" hint={list.error} />
            )}
            {list.data?.messages.length === 0 && (
              <EmptyState icon={<MailIcon size={20} />} title="Nothing here" hint={debounced ? "No mail matches your search." : "This folder is empty."} />
            )}
            {list.data?.messages.map((m) => (
              <button
                key={m.id}
                onClick={() => openMail(m)}
                className={`block w-full px-4 py-3 text-left transition-colors ${
                  activeId === m.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {m.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-bright shadow-[0_0_6px_var(--primary)]" />}
                  <p className={`min-w-0 flex-1 truncate text-sm ${m.unread ? "font-semibold" : "text-muted"}`}>{m.from}</p>
                  <span className="num shrink-0 text-[11px] text-faint">
                    {isToday(parseISO(m.date)) ? format(parseISO(m.date), "HH:mm") : format(parseISO(m.date), "MMM d")}
                  </span>
                </div>
                <p className={`mt-0.5 truncate text-[13px] ${m.unread ? "" : "text-muted"}`}>{m.subject}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="truncate text-xs text-faint">{m.snippet}</p>
                  {m.starred && <Star size={11} className="shrink-0 fill-accent text-accent" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* reader */}
        <div className={`min-w-0 flex-1 flex-col md:flex ${mobilePane === "read" ? "flex" : "hidden"}`}>
          {!activeId ? (
            <div className="panel flex flex-1 items-center justify-center">
              <EmptyState icon={<MailIcon size={20} />} title="Select a message" hint="Choose a conversation from the list to read it here." />
            </div>
          ) : !active ? (
            <div className="panel flex flex-1 flex-col gap-3 p-5">
              <div className="skeleton h-5 w-1/2" />
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton mt-4 h-40 w-full" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.article
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="panel flex flex-1 flex-col overflow-hidden"
              >
                <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2.5">
                  <button onClick={() => setMobilePane("list")} className="mr-1 text-muted md:hidden" aria-label="Back to list">
                    <ChevronLeft size={18} />
                  </button>
                  <span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{active.subject}</span>
                  <IconBtn label="Reply" onClick={() =>
                    setCompose({
                      to: active.fromEmail,
                      subject: active.subject.startsWith("Re:") ? active.subject : `Re: ${active.subject}`,
                      threadId: active.threadId,
                      inReplyTo: active.messageIdHeader,
                      body: `\n\n---\nOn ${format(parseISO(active.date), "MMM d, HH:mm")}, ${active.from} wrote:\n> ${active.body.split("\n").slice(0, 6).join("\n> ")}`,
                    })
                  }>
                    <CornerUpLeft size={15} />
                  </IconBtn>
                  <IconBtn label="Forward" onClick={() =>
                    setCompose({
                      subject: active.subject.startsWith("Fwd:") ? active.subject : `Fwd: ${active.subject}`,
                      body: `\n\n---------- Forwarded message ----------\nFrom: ${active.from} <${active.fromEmail}>\nDate: ${format(parseISO(active.date), "MMM d, yyyy HH:mm")}\nSubject: ${active.subject}\n\n${active.body}`,
                    })
                  }>
                    <CornerUpRight size={15} />
                  </IconBtn>
                  <IconBtn label={active.starred ? "Unstar" : "Star"} onClick={() => act(active.id, active.starred ? "unstar" : "star")}>
                    <Star size={15} className={active.starred ? "fill-accent text-accent" : ""} />
                  </IconBtn>
                  <IconBtn label="Mark unread" onClick={async () => {
                    if (await act(active.id, "unread", "Marked unread")) { setActiveId(null); setMobilePane("list"); }
                  }}>
                    <MailOpen size={15} />
                  </IconBtn>
                  {box === "archive" ? (
                    <IconBtn label="Move to inbox" onClick={async () => {
                      if (await act(active.id, "unarchive", "Moved to inbox")) { setActiveId(null); setMobilePane("list"); }
                    }}>
                      <ArchiveRestore size={15} />
                    </IconBtn>
                  ) : (
                    <IconBtn label="Archive" onClick={async () => {
                      if (await act(active.id, "archive", "Archived")) { setActiveId(null); setMobilePane("list"); }
                    }}>
                      <Archive size={15} />
                    </IconBtn>
                  )}
                  {box !== "spam" && (
                    <IconBtn label="Spam" onClick={async () => {
                      if (await act(active.id, "spam", "Marked as spam")) { setActiveId(null); setMobilePane("list"); }
                    }}>
                      <AlertOctagon size={15} />
                    </IconBtn>
                  )}
                  <IconBtn label={box === "trash" ? "Restore" : "Delete"} onClick={async () => {
                    if (await act(active.id, box === "trash" ? "untrash" : "trash", box === "trash" ? "Restored" : "Moved to trash")) {
                      setActiveId(null);
                      setMobilePane("list");
                    }
                  }}>
                    {box === "trash" ? <ArchiveRestore size={15} /> : <Trash2 size={15} />}
                  </IconBtn>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-sm font-semibold text-accent">
                      {active.from.replace(/[^A-Za-zÀ-ž ]/g, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "@"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{active.from}</p>
                      <p className="truncate text-xs text-faint">
                        {active.fromEmail} · {format(parseISO(active.date), "MMM d, HH:mm")}
                        {active.to ? ` · to ${active.to.split(",")[0]}` : ""}
                      </p>
                    </div>
                  </div>

                  <AiSummary key={active.id} mail={active} enabled={!!ai.data?.configured} />

                  <div className="prose-ember whitespace-pre-wrap break-words text-[15px] leading-relaxed">{active.body}</div>

                  {active.attachments.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                      {active.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={a.url ?? "#"}
                          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] transition-colors hover:border-white/[0.16]"
                        >
                          <Paperclip size={13} className="text-faint" />
                          {a.filename}
                          <span className="text-xs text-faint">{a.size > 1_048_576 ? `${(a.size / 1_048_576).toFixed(1)} MB` : `${Math.round(a.size / 1024)} KB`}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </motion.article>
            </AnimatePresence>
          )}
        </div>
      </div>

      <GmailCompose
        seed={compose}
        aiEnabled={!!ai.data?.configured}
        replyContext={compose?.threadId ? active : null}
        onClose={() => setCompose(null)}
        onSent={() => { invalidateApi(provider.base); void list.refresh(); }}
        provider={provider}
      />

      <CleanupTool
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        onFinished={() => void list.refresh()}
      />
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/[0.07] hover:text-ink">
      {children}
    </button>
  );
}

/* ---------------- AI summary ---------------- */

function AiSummary({ mail, enabled }: { mail: GmailDetail; enabled: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!enabled || mail.body.length < 280) return null;

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "summarize", subject: mail.subject, from: mail.from, body: mail.body }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "AI failed");
      setSummary(body.summary);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Summary failed", "info");
    }
    setBusy(false);
  };

  if (summary) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="mb-5 rounded-2xl border border-accent/15 bg-accent/[0.05] p-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
          <Sparkles size={12} /> AI summary
        </p>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{summary}</p>
      </motion.div>
    );
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      className="mb-5 flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-3.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-60"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {busy ? "Summarizing…" : "Summarize with AI"}
    </button>
  );
}

/* ---------------- compose ---------------- */

function GmailCompose({
  seed, aiEnabled, replyContext, onClose, onSent, provider,
}: {
  seed: ComposeSeed | null;
  aiEnabled: boolean;
  replyContext: GmailDetail | null;
  onClose: () => void;
  onSent: () => void;
  provider: MailProvider;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [replies, setReplies] = useState<string[] | null>(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [inited, setInited] = useState<ComposeSeed | null>(null);

  if (seed !== inited) {
    setInited(seed);
    if (seed) {
      setTo(seed.to ?? "");
      setSubject(seed.subject ?? "");
      setBody(seed.body ?? "");
      setFiles([]);
      setReplies(null);
      setSending(false);
    }
  }

  const totalSize = useMemo(() => files.reduce((a, f) => a + f.size, 0), [files]);

  const smartReplies = async () => {
    if (!replyContext) return;
    setLoadingReplies(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "replies", subject: replyContext.subject, from: replyContext.from, body: replyContext.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI failed");
      setReplies(data.replies);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Smart replies failed", "info");
    }
    setLoadingReplies(false);
  };

  const submit = async (draft: boolean) => {
    setSending(true);
    try {
      const attachments = await Promise.all(
        files.map(
          (f) =>
            new Promise<{ filename: string; mimeType: string; base64: string }>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () =>
                resolve({
                  filename: f.name,
                  mimeType: f.type || "application/octet-stream",
                  base64: (r.result as string).split(",")[1],
                });
              r.onerror = reject;
              r.readAsDataURL(f);
            }),
        ),
      );
      const input: GmailSendInput = {
        to: to.trim(), subject: subject.trim(), body,
        threadId: seed?.threadId, inReplyTo: seed?.inReplyTo,
        attachments: attachments.length ? attachments : undefined,
      };
      const res = await fetch(`${provider.base}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, draft }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "send failed");
      toast(draft ? `Saved to ${provider.name} drafts` : `Sent via ${provider.name}`);
      onSent();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Send failed", "info");
    }
    setSending(false);
  };

  return (
    <Modal open={!!seed} onClose={onClose} title={seed?.threadId ? "Reply" : seed?.subject?.startsWith("Fwd:") ? "Forward" : "New message"} wide>
      <div className="flex flex-col gap-4">
        <label>
          <Label>To</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" type="email" autoFocus />
        </label>
        <label>
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </label>

        {replyContext && aiEnabled && (
          <div>
            {!replies ? (
              <button
                onClick={smartReplies}
                disabled={loadingReplies}
                className="flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-3.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-60"
              >
                {loadingReplies ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {loadingReplies ? "Drafting…" : "Smart replies"}
              </button>
            ) : (
              <div className="flex flex-col gap-1.5">
                {replies.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setBody((b) => r + b.slice(b.indexOf("\n\n---") >= 0 ? b.indexOf("\n\n---") : b.length))}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left text-[13px] leading-relaxed text-muted transition-colors hover:border-accent/40 hover:text-ink"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label>
          <Label>Message</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write your message…" />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Paperclip size={13} /> Attach
          </Button>
          <input
            ref={fileRef} type="file" multiple className="hidden" aria-label="Attach files"
            onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])}
          />
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs">
              {f.name}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-faint hover:text-danger">×</button>
            </span>
          ))}
          {totalSize > 15 * 1_048_576 && <span className="text-xs text-danger">Attachments over 15 MB</span>}
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" disabled={sending || (!to && !subject && !body)} onClick={() => submit(true)}>
            Save draft
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Discard</Button>
            <Button variant="primary" disabled={!to.trim() || sending || totalSize > 15 * 1_048_576} onClick={() => submit(false)}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
