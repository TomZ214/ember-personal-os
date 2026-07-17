"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { differenceInCalendarDays, format, parseISO, setYear } from "date-fns";
import { Cake, Mail, Pencil, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useGoogleContacts } from "@/hooks/useIntegrations";
import type { Contact } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const GROUP_COLOR: Record<string, string> = {
  friends: "var(--c-sky)",
  family: "var(--c-rose)",
  work: "var(--c-amber)",
  google: "var(--c-sage)",
};

interface Person {
  id: string;
  name: string;
  group: string;
  email?: string;
  phone?: string;
  birthday?: string;
  notes?: string;
  photo?: string;
  source: "local" | "google";
  local?: Contact;
}

/** days until next birthday (0 = today), or null */
function daysToBirthday(birthday?: string): number | null {
  if (!birthday) return null;
  const today = new Date();
  let next = setYear(parseISO(birthday), today.getFullYear());
  if (differenceInCalendarDays(next, today) < 0) next = setYear(next, today.getFullYear() + 1);
  return differenceInCalendarDays(next, today);
}

export default function ContactsPage() {
  const hydrated = useHydrated();
  const contacts = useEmber((s) => s.contacts);
  const google = useGoogleContacts();
  const t = useT();
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);

  const groups = useMemo(
    () => ["all", "friends", "family", "work", ...(google.connected ? ["google"] : [])],
    [google.connected],
  );

  const people = useMemo<Person[]>(() => {
    const local: Person[] = contacts.map((c) => ({ ...c, source: "local", local: c }));
    const remote: Person[] = google.contacts.map((g) => ({
      id: g.id,
      name: g.name,
      group: "google",
      email: g.email,
      phone: g.phone,
      birthday: g.birthday,
      photo: g.photo,
      notes: g.organization,
      source: "google",
    }));
    // skip google entries that duplicate a local contact by name or email
    const seen = new Set(local.flatMap((c) => [c.name.toLowerCase(), c.email?.toLowerCase() ?? ""]));
    return [...local, ...remote.filter((r) => !seen.has(r.name.toLowerCase()) && !(r.email && seen.has(r.email.toLowerCase())))];
  }, [contacts, google.contacts]);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return people
      .filter((c) => group === "all" || c.group === group)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.notes?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, group, query]);

  const upcoming = useMemo(
    () =>
      people
        .map((c) => ({ c, days: daysToBirthday(c.birthday) }))
        .filter((x): x is { c: Person; days: number } => x.days !== null && x.days <= 30)
        .sort((a, b) => a.days - b.days)
        .slice(0, 6),
    [people],
  );

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  return (
    <div>
      <PageHeader
        title={t("contacts.title")}
        sub={`${people.length} ${t("contacts.people")}${google.connected ? ` · ${google.contacts.length} ${t("contacts.fromGoogle")}` : ""}`}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> {t("contacts.new")}
          </Button>
        }
      />

      {upcoming.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {upcoming.map(({ c, days }) => (
            <motion.span
              key={c.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] py-1.5 pl-2.5 pr-3.5 text-[13px]"
            >
              <Cake size={13} style={{ color: "var(--c-rose)" }} />
              <span className="font-medium">{c.name}</span>
              <span className="text-faint">{days === 0 ? t("contacts.bdayToday") : days === 1 ? t("contacts.bdayTomorrow") : t("contacts.bdayInDays").replace("{n}", String(days))}</span>
            </motion.span>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            aria-pressed={group === g}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              group === g ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
            }`}
          >
            {t(`contacts.g.${g}`)}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("contacts.searchPh")} className="h-9 pl-9" aria-label={t("contacts.search")} />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="panel">
          {people.length === 0 && !query ? (
            <EmptyState
              icon={<Users size={20} />}
              title={t("contacts.none")}
              hint="Add the people who matter — or pull them straight from your Google account."
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => setCreating(true)}>{t("contacts.add")}</Button>
                  {!google.connected && (
                    <Link href="/settings/connections">
                      <Button>{t("contacts.connectGoogle")}</Button>
                    </Link>
                  )}
                </div>
              }
            />
          ) : (
            <EmptyState icon={<Users size={20} />} title={t("contacts.noOne")} hint={t("contacts.nothingMatches")} />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), type: "spring", stiffness: 300, damping: 26 }}
              className="panel panel-hover group flex gap-3.5 p-4"
            >
              {c.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.photo} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
                  style={{
                    background: `color-mix(in oklch, ${GROUP_COLOR[c.group]} 16%, transparent)`,
                    color: GROUP_COLOR[c.group],
                  }}
                >
                  {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{c.name}</p>
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-faint">
                    {c.source === "google" ? "Google" : t(`contacts.g.${c.group}`)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-col gap-1 text-[13px] text-muted">
                  {c.phone && <span className="flex items-center gap-1.5 truncate"><Phone size={12} className="shrink-0 text-faint" />{c.phone}</span>}
                  {c.email && <span className="flex items-center gap-1.5 truncate"><Mail size={12} className="shrink-0 text-faint" />{c.email}</span>}
                  {c.birthday && (
                    <span className="flex items-center gap-1.5"><Cake size={12} className="shrink-0 text-faint" />{format(parseISO(c.birthday), "MMMM d")}</span>
                  )}
                </div>
                {c.notes && <p className="mt-1.5 truncate text-xs text-faint">{c.notes}</p>}
              </div>
              {c.source === "local" && (
                <button
                  onClick={() => setEditing(c.local!)}
                  aria-label={`Edit ${c.name}`}
                  className="self-start rounded-lg p-1.5 text-faint opacity-0 transition-all hover:bg-white/[0.07] hover:text-ink group-hover:opacity-100"
                >
                  <Pencil size={14} />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <ContactEditor open={creating} onClose={() => setCreating(false)} />
      <ContactEditor open={!!editing} contact={editing ?? undefined} onClose={() => setEditing(null)} />
    </div>
  );
}

function ContactEditor({ open, contact, onClose }: { open: boolean; contact?: Contact; onClose: () => void }) {
  const t = useT();
  const addContact = useEmber((s) => s.addContact);
  const updateContact = useEmber((s) => s.updateContact);
  const deleteContact = useEmber((s) => s.deleteContact);

  const [name, setName] = useState("");
  const [group, setGroup] = useState<Contact["group"]>("friends");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [notes, setNotes] = useState("");
  const [inited, setInited] = useState<string | null>(null);

  const initKey = open ? (contact?.id ?? "new") : null;
  if (initKey !== inited) {
    setInited(initKey);
    if (initKey) {
      setName(contact?.name ?? "");
      setGroup(contact?.group ?? "friends");
      setEmail(contact?.email ?? "");
      setPhone(contact?.phone ?? "");
      setBirthday(contact?.birthday ?? "");
      setNotes(contact?.notes ?? "");
    }
  }

  const save = () => {
    if (!name.trim()) return;
    const data = {
      name: name.trim(), group,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      birthday: birthday || undefined,
      notes: notes.trim() || undefined,
    };
    if (contact) {
      updateContact(contact.id, data);
      toast(t("contacts.updated"));
    } else {
      addContact(data);
      toast(t("contacts.added"));
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={contact ? t("contacts.edit") : t("contacts.new")}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("contacts.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label>
            <Label>{t("contacts.group")}</Label>
            <Select value={group} onChange={(e) => setGroup(e.target.value as Contact["group"])}>
              <option value="friends">{t("contacts.friends")}</option>
              <option value="family">{t("contacts.family")}</option>
              <option value="work">{t("contacts.work")}</option>
            </Select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("contacts.phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
          </label>
          <label>
            <Label>{t("contacts.email")}</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
        </div>
        <label>
          <Label>{t("contacts.birthday")}</Label>
          <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>
        <label>
          <Label>{t("contacts.notes")}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("contacts.notesPh")} />
        </label>
        <div className="flex items-center justify-between gap-2">
          {contact ? (
            <Button variant="danger" size="sm" onClick={() => { deleteContact(contact.id); toast(t("contacts.removed"), "info"); onClose(); }}>
              <Trash2 size={14} /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button>
            <Button variant="primary" onClick={save} disabled={!name.trim()}>{contact ? t("action.save") : t("contacts.add")}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
