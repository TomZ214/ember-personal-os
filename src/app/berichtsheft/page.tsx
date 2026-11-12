"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Download, Paperclip, Pencil, Plus, Search, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Label, Select, Textarea } from '@/components/ui/inputs';
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { toast } from '@/components/ui/toast';
import {
  cleanRecord, compareReports, nextReportDefaults, normalize, numberingIssues, searchable,
  similarTopics, splitTopics, topicConflicts, topicIndex, unusedTopics,
} from '@/lib/reports/core';
import { attachment, download, exportBackup, importReports, lastBackup, readReports, saveReports } from '@/lib/reports/storage';
import type { Report } from '@/lib/reports/types';

type Filter = 'all' | 'open' | 'completed' | 'missing';
type Tab = 'reports' | 'topics';
/** A report being edited; topics stay raw text until saving so typing is not rewritten. */
type Draft = { report: Report; topics: string };

const BACKUP_REMINDER_DAYS = 30;
const blank = (): Report => ({ id: crypto.randomUUID(), number: '', from: '', to: '', department: '', topics: [], status: 'open', note: '', reference: '', attachments: [] });
const toDraft = (report: Report): Draft => ({ report, topics: report.topics.join('; ') });
const germanDate = (iso: string) => iso.split('-').reverse().join('.');
const period = (r: Report) => [r.from, r.to].filter(Boolean).map(germanDate).join(' – ');
const label = (r: Report) => (r.number ? `Bericht ${r.number}` : 'Ohne Nummer');
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
const matches = (r: Report, filter: Filter) =>
  filter === 'all' || (filter === 'missing' ? !r.attachments.length : r.status === filter);

export default function BerichtsheftPage() {
  const [records, setRecords] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [backupAt, setBackupAt] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('reports');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Draft[] | null>(null);
  const [remove, setRemove] = useState<Report | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const search = useDeferredValue(query);

  useEffect(() => {
    let active = true;
    Promise.all([readReports(), lastBackup().catch(() => null)])
      .then(([rows, at]) => { if (active) { setRecords(rows); setBackupAt(at); } })
      .catch(e => { if (active) setError(message(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Derived data only changes with the archive, not with every keystroke.
  const index = useMemo(() => topicIndex(records), [records]);
  const ideas = useMemo(() => unusedTopics(records), [records]);
  const similar = useMemo(() => (tab === 'topics' ? similarTopics(index) : []), [index, tab]);
  const issues = useMemo(() => numberingIssues(records), [records]);
  const sorted = useMemo(() => records.map(r => ({ r, text: searchable(r) })).sort((a, b) => compareReports(a.r, b.r)), [records]);
  const shown = useMemo(() => {
    const words = normalize(search).split(' ').filter(Boolean);
    return sorted.filter(({ r, text }) => matches(r, filter) && words.every(w => text.includes(w))).map(({ r }) => r);
  }, [sorted, search, filter]);
  const completed = records.filter(r => r.status === 'completed').length;
  const withoutFile = records.filter(r => r.status === 'completed' && !r.attachments.length).length;

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  // Saved rows are applied locally instead of re-reading every attachment blob.
  const persist = async (rows: Report[], deleted?: string) => {
    await saveReports(rows, deleted);
    setRecords(current => {
      const byId = new Map(current.map(r => [r.id, r]));
      if (deleted) byId.delete(deleted);
      rows.forEach(r => byId.set(r.id, r));
      return [...byId.values()];
    });
  };
  const startEdit = (report?: Report) => {
    setError('');
    setDraft(toDraft(report ?? { ...blank(), ...nextReportDefaults(records) }));
  };
  const backup = () => run(async () => { setBackupAt(await exportBackup(records)); toast('Backup erstellt'); });
  const showFilter = (next: Filter) => { setTab('reports'); setFilter(next); };

  const saveDraft = (d: Draft) => run(async () => {
    const next: Report = { ...cleanRecord({ ...d.report, topics: splitTopics(d.topics) }), id: d.report.id, attachments: d.report.attachments, createdAt: d.report.createdAt ?? new Date().toISOString() };
    await persist([next]);
    setDraft(null);
    toast('Bericht gespeichert');
  });
  const acceptImport = (drafts: Draft[]) => run(async () => {
    const rows = drafts.map((d, i) => {
      try { return { ...d.report, ...cleanRecord({ ...d.report, topics: splitTopics(d.topics) }), attachments: d.report.attachments }; }
      catch (e) { throw new Error(`Eintrag ${i + 1}: ${message(e)}`); }
    });
    await persist(rows);
    setPending(null);
    toast(rows.length === 1 ? '1 Bericht übernommen' : `${rows.length} Berichte übernommen`);
  });

  const stats: [string, number, () => void][] = [
    ['Berichte', records.length, () => showFilter('all')],
    ['Abgeschlossen', completed, () => showFilter('completed')],
    ['Offen', records.length - completed, () => showFilter('open')],
    ['Behandelte Themen', index.length, () => setTab('topics')],
  ];
  const needsBackup = records.length > 0 && backupAt !== undefined && (backupAt === null || daysSince(backupAt) >= BACKUP_REMINDER_DAYS);
  const hasIssues = issues.missingCount > 0 || issues.duplicates.length > 0 || withoutFile > 0;

  return <div className="space-y-5">
    <PageHeader
      title="Berichtsheft"
      sub="Deine Ausbildung. Alle Berichte und Themen an einem Ort."
      actions={<div className="flex flex-wrap gap-2">
        <Button disabled={busy || loading} onClick={() => importInput.current?.click()}><Upload size={16} />Importieren</Button>
        <Button disabled={busy || loading || !records.length} onClick={() => void backup()}><Download size={16} />Backup</Button>
        <Button variant="primary" disabled={busy || loading} onClick={() => startEdit()}><Plus size={16} />Bericht</Button>
        <input ref={importInput} className="hidden" type="file" multiple accept=".json,.csv,.docx,.doc,.pdf,.txt" onChange={e => {
          const files = Array.from(e.target.files ?? []); e.target.value = '';
          void run(async () => {
            const rows = await importReports(files, records);
            if (rows.length) setPending(rows.map(toDraft)); else toast('Alle Einträge sind bereits vorhanden', 'info');
          });
        }} />
      </div>}
    />

    {error && !draft && !pending && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">{error}</div>}

    {needsBackup && <div className="panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <p className="flex items-center gap-2"><ShieldAlert size={18} className="shrink-0 text-warning" />
        {backupAt ? `Letztes Backup vor ${daysSince(backupAt)} Tagen.` : 'Noch kein Backup erstellt.'} Deine Berichte liegen nur auf diesem Gerät.</p>
      <Button size="sm" disabled={busy} onClick={() => void backup()}><Download size={14} />Jetzt sichern</Button>
    </div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([name, value, onClick]) =>
      <button type="button" key={name} disabled={loading} onClick={onClick} className="panel p-4 text-left">
        <p className="text-xs text-muted">{name}</p><p className="num mt-2 text-3xl font-semibold">{loading ? '–' : value}</p>
      </button>)}</div>

    <div role="tablist" className="flex gap-2">
      <Button role="tab" aria-selected={tab === 'reports'} variant={tab === 'reports' ? 'primary' : 'subtle'} onClick={() => setTab('reports')}>Berichte</Button>
      <Button role="tab" aria-selected={tab === 'topics'} variant={tab === 'topics' ? 'primary' : 'subtle'} onClick={() => setTab('topics')}>Themen & Ideen</Button>
    </div>

    {loading ? <div className="skeleton h-64" style={{ borderRadius: 18 }} /> : tab === 'reports' ? <>
      {hasIssues && <section className="panel space-y-1.5 p-4 text-sm">
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="text-warning" />Prüfung</h2>
        {issues.missingCount > 0 && <p className="text-muted">Fehlende Nummern: {issues.missing.join(', ')}{issues.missingCount > issues.missing.length && ` und ${issues.missingCount - issues.missing.length} weitere`}</p>}
        {issues.duplicates.length > 0 && <p className="text-muted">Doppelt vergebene Nummern: {issues.duplicates.join(', ')}</p>}
        {withoutFile > 0 && <p className="text-muted">{withoutFile} abgeschlossene{withoutFile === 1 ? 'r Bericht' : ' Berichte'} ohne hochgeladene Datei. <button type="button" className="text-accent hover:underline" onClick={() => showFilter('missing')}>Anzeigen</button></p>}
      </section>}

      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-48 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input aria-label="Berichte durchsuchen" className="pl-9" placeholder="Thema, Nummer, Abteilung oder Datei suchen …" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <Select aria-label="Status filtern" className="max-w-56" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
          <option value="all">Alle Berichte</option><option value="open">Offen</option><option value="completed">Abgeschlossen</option><option value="missing">Ohne hochgeladene Datei</option>
        </Select>
      </div>
      {(query || filter !== 'all') && records.length > 0 && <p className="text-xs text-muted">{shown.length} von {records.length} Berichten</p>}

      {!shown.length ? <div className="panel">{records.length
        ? <EmptyState icon={<Search size={20} />} title="Keine passenden Berichte" hint="Suchbegriff oder Filter anpassen." />
        : <EmptyState icon={<BookOpen size={20} />} title="Noch keine Berichte" hint="Erfasse deinen ersten Bericht oder importiere dein Sites-Backup." action={<Button variant="primary" onClick={() => startEdit()}><Plus size={16} />Bericht anlegen</Button>} />}
      </div> : <div className="grid gap-3 md:grid-cols-2">{shown.map(r => <ReportCard key={r.id} report={r} busy={busy}
        onEdit={() => startEdit(r)} onRemove={() => setRemove(r)}
        onToggle={() => void run(() => persist([{ ...r, status: r.status === 'completed' ? 'open' : 'completed' }]))} />)}</div>}
    </> : <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="font-semibold">Bereits behandelt</h2>
        <p className="mt-1 text-xs text-muted">Nur abgeschlossene Berichte zählen. Bekannte Schreibweisen werden zusammengefasst.</p>
        {index.length ? <div className="mt-4 flex flex-wrap gap-2">{index.map(t =>
          <span className="rounded-lg tile px-3 py-2 text-sm" key={t.key} title={t.records.map(label).join(', ')}>
            {t.name} · {t.records.length}{t.records.length > 1 && <span className="text-warning"> · mehrfach</span>}
          </span>)}</div> : <p className="mt-4 text-sm text-muted">Noch keine abgeschlossenen Berichte.</p>}
        {similar.length > 0 && <p className="mt-4 text-sm text-warning">Ähnliche Schreibweisen prüfen: {similar.map(p => p.join(' / ')).join('; ')}</p>}
      </section>
      <div>
        <h2 className="text-lg font-semibold">Ideen für deinen nächsten Bericht</h2>
        <p className="text-sm text-muted">Bereits behandelte und inhaltlich verwandte Themen werden ausgeschlossen.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{ideas.map(i => <article className="panel flex flex-col p-5" key={i.name}>
        <p className="text-xs text-accent">{i.category}</p><h3 className="mt-2 font-medium">{i.name}</h3>
        <p className="mt-2 flex-1 text-sm text-muted">{i.idea}</p>
        <Button size="sm" className="mt-4 self-start" disabled={busy} onClick={() => startEdit({ ...blank(), ...nextReportDefaults(records), topics: [i.name] })}>Als Entwurf anlegen</Button>
      </article>)}</div>
    </div>}

    <details className="panel p-4 text-sm text-muted"><summary className="cursor-pointer">Speicherung & Übernahme aus Sites</summary><p className="mt-3">Berichte und Anhänge liegen lokal auf diesem Gerät und werden nicht über Cloud Sync übertragen. Sichere sie regelmäßig mit „Backup“. Im bisherigen Sites-Checker unter „Backup & Daten“ exportieren, anschließend hier importieren und prüfen. DOCX-Überschriften werden lokal ausgelesen; bei DOC/PDF wird der Dateiname vorgeschlagen.</p></details>

    <Modal open={!!draft} onClose={() => { if (!busy) setDraft(null); }} title={draft && records.some(r => r.id === draft.report.id) ? 'Bericht bearbeiten' : 'Neuer Bericht'} wide>
      {draft && <ReportForm draft={draft} records={records} busy={busy} error={error} onChange={setDraft} onError={setError} onSubmit={() => void saveDraft(draft)} />}
    </Modal>

    <Modal open={pending !== null} onClose={() => { if (!busy) setPending(null); }} title="Import prüfen" wide>
      <p className="mb-4 text-sm text-muted">{pending?.length === 1 ? '1 neuer Eintrag' : `${pending?.length} neue Einträge`}. Themen vor der Übernahme prüfen; identische Einträge wurden bereits übersprungen.</p>
      <div className="space-y-3">{pending?.map((d, i) => <div className="rounded-xl tile p-3" key={d.report.id}>
        <p className="mb-2 text-xs text-muted">{d.report.number ? `Bericht ${d.report.number}` : 'Neuer Bericht'}{period(d.report) && ` · ${period(d.report)}`} · {d.report.attachments.length === 1 ? '1 Anhang' : `${d.report.attachments.length} Anhänge`}</p>
        <Input aria-label={`Themen Eintrag ${i + 1}`} value={d.topics} onChange={e => setPending(p => p?.map((x, j) => (j === i ? { ...x, topics: e.target.value } : x)) ?? null)} />
        <TopicHints topics={d.topics} records={records} excludeId={d.report.id} />
        <Button className="mt-2" size="sm" variant="ghost" disabled={busy} onClick={() => setPending(p => p?.filter((_, j) => j !== i) ?? null)}>Überspringen</Button>
      </div>)}</div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <Button className="mt-4" variant="primary" disabled={busy || !pending?.length} onClick={() => pending && void acceptImport(pending)}>Übernehmen</Button>
    </Modal>

    <Modal open={!!remove} onClose={() => { if (!busy) setRemove(null); }} title="Bericht löschen?">
      <p className="mb-4 text-sm text-muted">„{remove?.topics.join(' · ')}“ und {remove?.attachments.length === 1 ? 'sein Anhang wird' : 'seine Anhänge werden'} von diesem Gerät entfernt. Ein zuvor exportiertes Backup bleibt erhalten.</p>
      <div className="flex gap-2">
        <Button variant="danger" disabled={busy} onClick={() => remove && void run(async () => { await persist([], remove.id); setRemove(null); toast('Bericht gelöscht'); })}>Löschen</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setRemove(null)}>Abbrechen</Button>
      </div>
    </Modal>
  </div>;
}

function ReportCard({ report: r, busy, onEdit, onRemove, onToggle }: { report: Report; busy: boolean; onEdit: () => void; onRemove: () => void; onToggle: () => void }) {
  const done = r.status === 'completed';
  return <article className="panel flex flex-col p-5">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs text-muted">{label(r)}<Badge color={done ? 'sage' : 'amber'}>{done ? 'Abgeschlossen' : 'Offen'}</Badge></span>
      <div className="flex">
        <Button size="sm" variant="ghost" disabled={busy} aria-label="Bericht bearbeiten" onClick={onEdit}><Pencil size={15} /></Button>
        <Button size="sm" variant="ghost" disabled={busy} aria-label="Bericht löschen" onClick={onRemove}><Trash2 size={15} /></Button>
      </div>
    </div>
    <button type="button" className="mt-2 text-left text-lg font-medium hover:text-accent" onClick={onEdit}>{r.topics.join(' · ')}</button>
    {(r.department || period(r)) && <p className="mt-1 text-xs text-muted">{[r.department, period(r)].filter(Boolean).join(' · ')}</p>}
    {r.note && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{r.note}</p>}
    {r.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{r.attachments.map(a =>
      <Button size="sm" key={a.id} title={`${a.name} herunterladen`} onClick={() => download(a.blob, a.name)}><Paperclip size={13} /><span className="max-w-48 truncate">{a.name}</span></Button>)}</div>}
    {r.reference && <p className="mt-2 text-xs text-faint">Dateiverweis: {r.reference}</p>}
    <div className="mt-auto pt-3">
      <Button size="sm" disabled={busy} onClick={onToggle}>{done ? 'Als offen markieren' : <><Check size={14} />Abschließen</>}</Button>
    </div>
  </article>;
}

/** Live warning when a topic was already covered or overlaps a covered one. */
function TopicHints({ topics, records, excludeId }: { topics: string; records: Report[]; excludeId: string }) {
  const value = useDeferredValue(topics);
  const conflicts = useMemo(() => topicConflicts(value, records, excludeId), [value, records, excludeId]);
  if (!conflicts.length) return null;
  return <ul className="mt-2 space-y-1 text-xs text-warning">{conflicts.map(c => <li className="flex gap-1.5" key={c.topic}>
    <AlertTriangle size={13} className="mt-px shrink-0" />
    <span>{c.same.length
      ? `„${c.topic}“ wurde bereits behandelt (${c.same.map(label).join(', ')}).`
      : `„${c.topic}“ überschneidet sich mit ${c.related.map(t => `„${t.name}“ (${t.records.map(label).join(', ')})`).join(', ')}.`}</span>
  </li>)}</ul>;
}

function ReportForm({ draft, records, busy, error, onChange, onError, onSubmit }: {
  draft: Draft; records: Report[]; busy: boolean; error: string;
  onChange: (d: Draft) => void; onError: (e: string) => void; onSubmit: () => void;
}) {
  const files = useRef<HTMLInputElement>(null);
  const r = draft.report;
  const set = (patch: Partial<Report>) => onChange({ ...draft, report: { ...r, ...patch } });
  const fields = [['number', 'Nummer', 'text'], ['department', 'Abteilung', 'text'], ['from', 'Von', 'date'], ['to', 'Bis', 'date']] as const;
  const addFiles = async (list: File[]) => {
    onError('');
    try { const added = await Promise.all(list.map(attachment)); set({ attachments: [...r.attachments, ...added] }); }
    catch (e) { onError(message(e)); }
  };
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
    <div className="grid grid-cols-2 gap-3">{fields.map(([key, name, type]) => <label className="block" key={key}>
      <Label>{name}</Label><Input type={type} value={r[key]} min={key === 'to' ? r.from || undefined : undefined} onChange={e => set({ [key]: e.target.value })} />
    </label>)}</div>
    <label className="block"><Label>Themen (mit Semikolon trennen)</Label>
      <Input required autoFocus value={draft.topics} onChange={e => onChange({ ...draft, topics: e.target.value })} />
      <TopicHints topics={draft.topics} records={records} excludeId={r.id} />
    </label>
    <label className="block"><Label>Status</Label>
      <Select value={r.status} onChange={e => set({ status: e.target.value as Report['status'] })}><option value="open">Offen / Entwurf</option><option value="completed">Abgeschlossen</option></Select>
    </label>
    <label className="block"><Label>Notiz</Label><Textarea rows={3} value={r.note} onChange={e => set({ note: e.target.value })} /></label>
    <label className="block"><Label>Dateiverweis</Label><Input value={r.reference} placeholder="Dateiname, mehrere mit | trennen" onChange={e => set({ reference: e.target.value })} /></label>
    <div>
      <Label>Anhänge (DOCX, DOC, PDF, TXT · maximal 20 MB je Datei)</Label>
      <div className="space-y-1.5">{r.attachments.map(a => <div className="flex items-center justify-between gap-2 rounded-lg tile px-3 py-1.5 text-sm" key={a.id}>
        <span className="flex min-w-0 items-center gap-2"><Paperclip size={13} className="shrink-0" /><span className="truncate">{a.name}</span></span>
        <Button type="button" size="sm" variant="ghost" aria-label={`${a.name} entfernen`} onClick={() => set({ attachments: r.attachments.filter(x => x.id !== a.id) })}><Trash2 size={14} /></Button>
      </div>)}</div>
      <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => files.current?.click()}><Paperclip size={14} />Datei anhängen</Button>
      <input ref={files} className="hidden" type="file" multiple accept=".docx,.doc,.pdf,.txt" onChange={e => { const list = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(list); }} />
    </div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <Button type="submit" variant="primary" disabled={busy}>Speichern</Button>
  </form>;
}
