"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { format, isToday, parseISO } from "date-fns";
import {
  Archive, CheckCheck, ChevronLeft, FileText, Inbox, Mail as MailIcon, Paperclip, PenLine, Search,
  Send, Sparkles, Star, Trash2,
} from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { dfLocale } from "@/lib/dates";
import type { Mail, MailFolder, MailLabel } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const LABEL_COLOR: Record<MailLabel, string> = {
  personal: "var(--c-sage)",
  work: "var(--c-sky)",
  updates: "var(--c-lilac)",
  finance: "var(--c-amber)",
};

type Box = MailFolder | "starred";

export function LocalMail() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const t = useT();
  const lang = useLang();
  const { mails, updateMail, deleteMail, markAllMailsRead } = useEmber();
  const [box, setBox] = useState<Box>("inbox");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(params.get("id"));
  const [composing, setComposing] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "read">(params.get("id") ? "read" : "list");

  const active = mails.find((m) => m.id === activeId) ?? null;

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return mails
      .filter((m) => (box === "starred" ? m.starred : m.folder === box))
      .filter((m) => !q || m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q) || m.body.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [mails, box, query]);

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  const unread = mails.filter((m) => m.folder === "inbox" && !m.read).length;

  const boxes: { id: Box; label: string; icon: typeof Inbox; count?: number }[] = [
    { id: "inbox", label: t("mail.box.inbox"), icon: Inbox, count: unread },
    { id: "starred", label: t("mail.box.starred"), icon: Star },
    { id: "sent", label: t("mail.box.sent"), icon: Send },
    { id: "drafts", label: t("mail.box.drafts"), icon: FileText, count: mails.filter((m) => m.folder === "drafts").length || undefined },
    { id: "archive", label: t("mail.box.archive"), icon: Archive },
  ];

  const openMail = (m: Mail) => {
    setActiveId(m.id);
    if (!m.read) updateMail(m.id, { read: true });
    setMobilePane("read");
  };

  return (
    <div>
      <PageHeader
        title={t("mail.title")}
        sub={unread ? t("mail.unreadInInbox").replace("{n}", String(unread)) : mails.length ? t("mail.inboxZero") : t("mail.localMailbox")}
        actions={
          <>
            {unread > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  markAllMailsRead();
                  toast((unread === 1 ? t("mail.markedReadOne") : t("mail.markedReadMany")).replace("{n}", String(unread)));
                }}
                title={t("mail.markAllRead")}
              >
                <CheckCheck size={14} /> {t("mail.readAll")}
              </Button>
            )}
            <Button variant="primary" onClick={() => setComposing(true)}>
              <PenLine size={15} /> {t("mail.compose")}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {boxes.map((b) => {
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
              {b.count ? <span className="num rounded-full bg-primary px-1.5 text-[10px] font-semibold text-(--on-sunset)">{b.count}</span> : null}
            </button>
          );
        })}
        <div className="relative ml-auto w-full sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("mail.searchLocal")} className="h-9 pl-9" aria-label={t("mail.search")} />
        </div>
      </div>

      <div className="flex h-[calc(100dvh-19rem)] min-h-[26rem] gap-4">
        {/* list */}
        <div className={`w-full flex-col md:flex md:w-96 md:shrink-0 ${mobilePane === "list" ? "flex" : "hidden"}`}>
          <div className="panel flex-1 divide-y divide-white/[0.05] overflow-y-auto">
            {list.length === 0 &&
              (mails.length === 0 && !query ? (
                <EmptyState
                  icon={<MailIcon size={20} />}
                  title={t("mail.connectGmailTitle")}
                  hint={t("mail.connectGmailHint")}
                  action={
                    <Link href="/settings/connections">
                      <Button variant="primary">{t("mail.connectGmail")}</Button>
                    </Link>
                  }
                />
              ) : (
                <EmptyState icon={<MailIcon size={20} />} title={t("mail.nothingHere")} hint={query ? t("mail.noMatch") : t("mail.folderEmpty")} />
              ))}
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => openMail(m)}
                className={`block w-full px-4 py-3 text-left transition-colors ${
                  activeId === m.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {!m.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-bright shadow-[0_0_6px_var(--primary)]" />}
                  <p className={`min-w-0 flex-1 truncate text-sm ${m.read ? "text-muted" : "font-semibold"}`}>{m.from}</p>
                  <span className="num shrink-0 text-[11px] text-faint">
                    {isToday(parseISO(m.date)) ? format(parseISO(m.date), "HH:mm") : format(parseISO(m.date), lang === "de" ? "d. MMM" : "MMM d", { locale: dfLocale(lang) })}
                  </span>
                </div>
                <p className={`mt-0.5 truncate text-[13px] ${m.read ? "text-muted" : ""}`}>{m.subject}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LABEL_COLOR[m.label] }} />
                  <p className="truncate text-xs text-faint">{m.body.split("\n")[0]}</p>
                  {m.attachments?.length ? <Paperclip size={11} className="shrink-0 text-faint" /> : null}
                  {m.starred && <Star size={11} className="shrink-0 fill-accent text-accent" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* reader */}
        <div className={`min-w-0 flex-1 flex-col md:flex ${mobilePane === "read" ? "flex" : "hidden"}`}>
          {!active ? (
            <div className="panel flex flex-1 items-center justify-center">
              <EmptyState icon={<MailIcon size={20} />} title={t("mail.selectMsg")} hint={t("mail.selectMsgHint")} />
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
                <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
                  <button onClick={() => setMobilePane("list")} className="mr-1 text-muted md:hidden" aria-label={t("mail.back")}>
                    <ChevronLeft size={18} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{active.subject}</span>
                  <IconBtn
                    label={active.starred ? t("mail.unstar") : t("mail.star")}
                    onClick={() => updateMail(active.id, { starred: !active.starred })}
                  >
                    <Star size={15} className={active.starred ? "fill-accent text-accent" : ""} />
                  </IconBtn>
                  {active.folder !== "archive" && (
                    <IconBtn label={t("mail.archive")} onClick={() => { updateMail(active.id, { folder: "archive" }); toast(t("mail.archived"), "info"); setActiveId(null); setMobilePane("list"); }}>
                      <Archive size={15} />
                    </IconBtn>
                  )}
                  <IconBtn label={t("mail.delete")} onClick={() => { deleteMail(active.id); toast(t("mail.deleted"), "info"); setActiveId(null); setMobilePane("list"); }}>
                    <Trash2 size={15} />
                  </IconBtn>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                      style={{ background: `color-mix(in oklch, ${LABEL_COLOR[active.label]} 18%, transparent)`, color: LABEL_COLOR[active.label] }}>
                      {active.from.replace(/[^A-Za-zÀ-ž ]/g, "").split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{active.from}</p>
                      <p className="truncate text-xs text-faint">{active.fromEmail} · {format(parseISO(active.date), lang === "de" ? "d. MMM, HH:mm" : "MMM d, HH:mm", { locale: dfLocale(lang) })}</p>
                    </div>
                    <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={{ background: `color-mix(in oklch, ${LABEL_COLOR[active.label]} 14%, transparent)`, color: LABEL_COLOR[active.label] }}>
                      {t(`mail.label.${active.label}`)}
                    </span>
                  </div>

                  <Summary body={active.body} />

                  <div className="prose-ember whitespace-pre-wrap text-[15px] leading-relaxed">{active.body}</div>

                  {active.attachments?.length ? (
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                      {active.attachments.map((a) => (
                        <span key={a.name} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px]">
                          <Paperclip size={13} className="text-faint" />
                          {a.name}
                          <span className="text-xs text-faint">{a.size}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </motion.article>
            </AnimatePresence>
          )}
        </div>
      </div>

      <Compose open={composing} onClose={() => setComposing(false)} />
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

/** Extractive quick summary: first sentence + detected bullet lines. */
function Summary({ body }: { body: string }) {
  const t = useT();
  const summary = useMemo(() => {
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^[•\-–*]/.test(l)).slice(0, 3);
    const firstPara = lines.find((l) => !/^[•\-–*]/.test(l) && l.length > 30) ?? lines[0] ?? "";
    const first = firstPara.split(/(?<=[.!?])\s/)[0];
    return { first, bullets };
  }, [body]);

  if (!summary.first && summary.bullets.length === 0) return null;

  return (
    <div className="mb-5 rounded-2xl border border-accent/15 bg-accent/[0.05] p-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
        <Sparkles size={12} /> {t("mail.quickSummary")}
      </p>
      <p className="text-[13px] leading-relaxed text-muted">{summary.first}</p>
      {summary.bullets.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-muted">
          {summary.bullets.map((b, i) => (
            <li key={i} className="truncate">{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Compose({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sendMail = useEmber((s) => s.sendMail);
  const t = useT();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const reset = () => { setTo(""); setSubject(""); setBody(""); };

  return (
    <Modal open={open} onClose={onClose} title={t("mail.newMessage")} wide>
      <div className="flex flex-col gap-4">
        <label>
          <Label>{t("mail.to")}</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" type="email" autoFocus />
        </label>
        <label>
          <Label>{t("mail.subject")}</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("mail.subject")} />
        </label>
        <label>
          <Label>{t("mail.message")}</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder={t("mail.messagePh")} />
        </label>
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            disabled={!to && !subject && !body}
            onClick={() => { sendMail({ to, subject, body, draft: true }); toast(t("mail.savedToDrafts"), "info"); reset(); onClose(); }}
          >
            {t("mail.saveDraft")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t("mail.discard")}</Button>
            <Button variant="primary" disabled={!to.trim()} onClick={() => { sendMail({ to, subject, body }); toast(t("mail.messageSent"), "success", "send"); reset(); onClose(); }}>
              <Send size={14} /> {t("mail.send")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
