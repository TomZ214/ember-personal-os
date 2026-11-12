"use client";

import { useMemo, useRef, useState } from "react";
import { format, subMonths } from "date-fns";
import { CheckCircle2, ExternalLink, FileSpreadsheet, Loader2, Undo2, Upload } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { dfLocale, eur } from "@/lib/dates";
import { ImportFormatError, parseDelimited, parseImport, type ParsedImport } from "@/lib/finance/finanzguru";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Label, Select } from "@/components/ui/inputs";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";

const HELP_URL = "https://hilfe.finanzguru.de/de/articles/3728782-exportiere-deine-umsatze-und-analysen";
const MAX_FILE = 25 * 1024 * 1024;
type Period = "3" | "6" | "12" | "all";

export function FinanzguruImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const txns = useEmber((s) => s.txns);
  const privacy = useEmber((s) => s.privacy);
  const importTxns = useEmber((s) => s.importTxns);
  const deleteTxnBatch = useEmber((s) => s.deleteTxnBatch);
  const input = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [accounts, setAccounts] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<Period>("12");
  const [skipTransfers, setSkipTransfers] = useState(true);
  const [done, setDone] = useState<{ added: number; batch: string } | null>(null);

  const reset = () => { setParsed(null); setError(""); setDone(null); setFileName(""); };
  const close = () => { if (busy) return; onClose(); setTimeout(reset, 300); };

  const readFile = async (file: File) => {
    setError(""); setBusy(true);
    try {
      if (file.size > MAX_FILE) throw new Error(t("fin.fg.tooLarge"));
      const ext = file.name.split(".").pop()?.toLowerCase();
      let table;
      if (ext === "csv" || ext === "txt") table = parseDelimited(await file.text());
      else if (ext === "xlsx") {
        // loaded on demand: only people who import pay for the zip reader
        const { readXlsx } = await import("@/lib/finance/xlsx");
        table = await readXlsx(file);
      } else throw new Error(t("fin.fg.wrongType"));
      const result = parseImport(table);
      if (!result.rows.length) throw new Error(t("fin.fg.empty"));
      setParsed(result);
      setFileName(file.name);
      setAccounts(new Set(result.accounts));
    } catch (e) {
      if (e instanceof ImportFormatError) {
        setError(t("fin.fg.noColumns").replace("{found}", e.found.length ? e.found.join(", ") : "—"));
      } else if (e instanceof Error && e.message && !["xlsx", "xlsx-too-large"].includes(e.message)) {
        setError(e.message);
      } else {
        setError(e instanceof Error && e.message === "xlsx-too-large" ? t("fin.fg.tooLarge") : t("fin.fg.unreadable"));
      }
    } finally {
      setBusy(false);
    }
  };

  const known = useMemo(() => new Set(txns.map((x) => x.importKey).filter(Boolean)), [txns]);
  const view = useMemo(() => {
    if (!parsed) return null;
    const cutoff = period === "all" ? "" : format(subMonths(new Date(), Number(period)), "yyyy-MM-dd");
    const inScope = parsed.rows.filter((r) => accounts.has(r.account) && r.date >= cutoff && !(skipTransfers && r.transfer));
    const fresh = inScope.filter((r) => !known.has(r.importKey));
    return {
      inScope,
      fresh,
      income: fresh.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount, 0),
      expenses: fresh.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount, 0),
      transfers: parsed.rows.filter((r) => r.transfer).length,
      perAccount: new Map(parsed.accounts.map((a) => [a, parsed.rows.filter((r) => r.account === a).length])),
    };
  }, [parsed, accounts, period, skipTransfers, known]);

  const money = (n: number) => (privacy ? "•••" : eur(n));
  const day = (iso: string) => format(new Date(`${iso}T12:00:00`), lang === "de" ? "d. MMM yyyy" : "MMM d, yyyy", { locale: dfLocale(lang) });

  const runImport = () => {
    if (!view?.fresh.length) return;
    const batch = `fg-${Date.now()}`;
    const added = importTxns(view.fresh.map((r) => ({
      kind: r.kind, amount: r.amount, category: r.category, date: r.date, note: r.note,
      importKey: r.importKey, importBatch: batch, account: r.account,
    })));
    setDone({ added, batch });
    toast(t("fin.fg.imported").replace("{n}", String(added)));
  };

  return (
    <Modal open={open} onClose={close} title={t("fin.fg.title")} wide>
      {done ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 size={40} className="mx-auto text-success" />
          <p className="font-medium">{t("fin.fg.imported").replace("{n}", String(done.added))}</p>
          <p className="text-sm text-muted">{t("fin.fg.again")}</p>
          <div className="flex justify-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                const n = deleteTxnBatch(done.batch);
                toast(t("fin.fg.undone").replace("{n}", String(n)), "info");
                setDone(null);
              }}
            >
              <Undo2 size={15} />{t("fin.fg.undo")}
            </Button>
            <Button variant="primary" onClick={close}>{t("fin.fg.close")}</Button>
          </div>
        </div>
      ) : !parsed || !view ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>{t("fin.fg.step1")}</li>
            <li>{t("fin.fg.step2")}</li>
            <li>{t("fin.fg.step3")}</li>
          </ol>
          <a href={HELP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            {t("fin.fg.help")} <ExternalLink size={13} />
          </a>
          <p className="rounded-xl tile p-3 text-xs text-muted">{t("fin.fg.noApi")}</p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {busy ? t("fin.fg.reading") : t("fin.fg.choose")}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readFile(f); }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl tile p-3">
            <FileSpreadsheet size={22} className="shrink-0 text-success" />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{fileName}</p>
              <p className="text-xs text-muted">
                {t("fin.fg.summary").replace("{n}", String(parsed.rows.length)).replace("{from}", day(parsed.rows[0].date)).replace("{to}", day(parsed.rows[parsed.rows.length - 1].date))}
                {parsed.skipped > 0 && ` · ${t("fin.fg.skipped").replace("{n}", String(parsed.skipped))}`}
              </p>
            </div>
          </div>

          {parsed.accounts.length > 1 && (
            <fieldset>
              <Label>{t("fin.fg.accounts")}</Label>
              <div className="space-y-1">
                {parsed.accounts.map((a) => (
                  <label key={a} className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 hover:bg-white/[0.04]">
                    <span className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--accent)]"
                        checked={accounts.has(a)}
                        onChange={(e) => setAccounts((cur) => { const next = new Set(cur); if (e.target.checked) next.add(a); else next.delete(a); return next; })}
                      />
                      {a}
                    </span>
                    <span className="num text-xs text-muted">{view.perAccount.get(a)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block">
            <Label>{t("fin.fg.period")}</Label>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="3">{t("fin.fg.months").replace("{n}", "3")}</option>
              <option value="6">{t("fin.fg.months").replace("{n}", "6")}</option>
              <option value="12">{t("fin.fg.months").replace("{n}", "12")}</option>
              <option value="all">{t("fin.fg.all")}</option>
            </Select>
          </label>

          {view.transfers > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl tile p-3">
              <div>
                <p className="text-sm font-medium">{t("fin.fg.skipTransfers")}</p>
                <p className="text-xs text-muted">{t("fin.fg.skipTransfersHint").replace("{n}", String(view.transfers))}</p>
              </div>
              <Switch checked={skipTransfers} onChange={setSkipTransfers} label={t("fin.fg.skipTransfers")} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl tile p-3"><p className="num text-lg font-semibold">{view.fresh.length}</p><p className="text-[11px] text-muted">{t("fin.fg.new")}</p></div>
            <div className="rounded-xl tile p-3"><p className="num text-lg font-semibold text-success">{money(view.income)}</p><p className="text-[11px] text-muted">{t("fin.fg.income")}</p></div>
            <div className="rounded-xl tile p-3"><p className="num text-lg font-semibold">{money(view.expenses)}</p><p className="text-[11px] text-muted">{t("fin.fg.expenses")}</p></div>
          </div>
          {view.inScope.length > view.fresh.length && (
            <p className="text-xs text-muted">{t("fin.fg.duplicates").replace("{n}", String(view.inScope.length - view.fresh.length))}</p>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>{t("fin.fg.otherFile")}</Button>
            <Button variant="primary" className="flex-1" disabled={!view.fresh.length} onClick={runImport}>
              <Upload size={16} />
              {view.fresh.length ? t("fin.fg.importN").replace("{n}", String(view.fresh.length)) : t("fin.fg.nothingNew")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
