import { categorize, cleanMerchant } from "./categorize";

/**
 * Import of a Finanzguru transaction export (Excel or CSV).
 *
 * Finanzguru has no public API, so there is no live sync: the user exports
 * their transactions in the Finanzguru app and loads the file here. Known
 * export columns: "Buchungstag", "Betrag", "Beguenstigter/Auftraggeber",
 * "Verwendungszweck", "Name Referenzkonto"; category columns are used when
 * present. Columns are found by name, so their order does not matter.
 *
 * Every row gets a stable key, so importing a newer export later only adds
 * what is new — nothing is ever counted twice.
 */

export type Cell = string | number | boolean | null | undefined;

export interface ImportedTxn {
  importKey: string;
  account: string;
  date: string;
  kind: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  /** a move between the user's own accounts, not real income or spending */
  transfer: boolean;
}

export interface ParsedImport {
  rows: ImportedTxn[];
  accounts: string[];
  /** rows without a usable date or amount, or in a foreign currency */
  skipped: number;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COLUMNS = {
  date: ["buchungstag", "buchungsdatum", "datum", "date", "valuta", "wertstellung"],
  amount: ["betrag", "betrag eur", "betrag in eur", "umsatz", "amount"],
  payee: ["beguenstigter auftraggeber", "zahlungsbeteiligter", "empfaenger", "auftraggeber", "name", "payee"],
  memo: ["verwendungszweck", "beschreibung", "buchungstext", "memo"],
  account: ["name referenzkonto", "referenzkonto", "kontoname", "konto", "account"],
  category: ["analyse hauptkategorie", "hauptkategorie", "kategorie", "category"],
  subcategory: ["analyse unterkategorie", "unterkategorie", "subcategory"],
  currency: ["waehrung", "currency"],
} as const;
type Column = keyof typeof COLUMNS;

/** column index per field; aliases are tried in order, so the first is preferred */
export function findColumns(header: Cell[]): Partial<Record<Column, number>> {
  const names = header.map(norm);
  const found: Partial<Record<Column, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    for (const alias of aliases) {
      const i = names.indexOf(alias);
      if (i >= 0 && !Object.values(found).includes(i)) { found[field] = i; break; }
    }
  }
  return found;
}

/* ---------------- values ---------------- */

/** Excel counts days from 1899-12-30 (the 1900 leap-year bug included) */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function parseDate(v: Cell): string | null {
  if (typeof v === "number") return excelSerialToIso(v);
  const s = String(v ?? "").trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/);
  if (match) {
    d = +match[1]; m = +match[2]; y = +match[3];
    if (y < 100) y += 2000;
  } else if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    y = +match[1]; m = +match[2]; d = +match[3];
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    return excelSerialToIso(Number(s));
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** "-1.234,56 €" → -1234.56 with a decimal comma; "1,234.56" → 1234.56 without */
export function parseAmount(v: Cell, decimalComma: boolean): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[\s €]|eur/gi, "").replace(/[−–]/g, "-");
  if (!s) return null;
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/* ---------------- categories ---------------- */

/** Finanzguru category words → Ember's categories (first match wins) */
const CATEGORY_RULES: [RegExp, string][] = [
  [/umbuchung|uebertrag|eigene konten|kontouebertrag|transfer/, "__transfer__"],
  [/gehalt|lohn|einkommen|rente|bafoeg/, "Salary"],
  [/geschenk/, "Gift"],
  [/lebensmittel|supermarkt/, "Groceries"],
  [/restaurant|gastronomie|essen|lieferdienst|cafe|imbiss/, "Dining"],
  [/miete|wohnen|haushalt/, "Rent"],
  [/strom|gas|energie|wasser|internet|telefon|handy|mobilfunk|rundfunk|nebenkosten/, "Utilities"],
  [/versicherung/, "Insurance"],
  [/mobilitaet|verkehr|tanken|kraftstoff|auto|bahn|oepnv|taxi|parken/, "Transport"],
  [/gesundheit|apotheke|arzt|medizin/, "Health"],
  [/reise|urlaub|hotel|flug/, "Travel"],
  [/abo|vertrag|mitgliedschaft|streaming/, "Subscriptions"],
  [/freizeit|unterhaltung|kultur|hobby|sport|kino|spiele/, "Entertainment"],
  [/shopping|kleidung|elektronik|drogerie|einkauf|online handel/, "Shopping"],
  [/sparen|geldanlage|depot|wertpapier|investment|sparplan/, "Savings"],
  [/bargeld|geldautomat/, "Cash"],
  [/gebuehr|bankkosten|zinsen|entgelt/, "Fees"],
];

/** categorize.ts speaks a bank vocabulary; fold it into Ember's set */
const FROM_RULES: Record<string, string> = {
  Drugstore: "Shopping", Housing: "Rent", "Internet & Mobile": "Utilities", Broadcasting: "Utilities",
  Fitness: "Health",
};

function categoryFor(main: string, sub: string, payee: string, memo: string, amount: number): { category: string; transfer: boolean } {
  for (const text of [norm(sub), norm(main)]) {
    if (!text) continue;
    for (const [pattern, category] of CATEGORY_RULES) {
      if (!pattern.test(text)) continue;
      if (category === "__transfer__") return { category: "Other", transfer: true };
      // a refund in a spending category stays income, but keeps a sensible name
      if (amount > 0 && !["Salary", "Gift", "Savings"].includes(category)) return { category: "Other", transfer: false };
      if (amount < 0 && (category === "Salary" || category === "Gift")) return { category: "Other", transfer: false };
      return { category, transfer: false };
    }
  }
  if (amount > 0) return { category: /gehalt|lohn|salary|bezuege|besoldung/i.test(`${payee} ${memo}`) ? "Salary" : "Other", transfer: false };
  const rule = categorize(payee, memo, amount);
  return { category: FROM_RULES[rule] ?? rule, transfer: false };
}

/* ---------------- rows ---------------- */

/** stable 32-bit FNV-1a hash, hex */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export class ImportFormatError extends Error {
  constructor(public found: string[]) {
    super("format");
  }
}

export function parseImport(table: Cell[][]): ParsedImport {
  // exports sometimes start with a title line; look for the header in the first rows
  let headerRow = -1;
  let cols: Partial<Record<Column, number>> = {};
  for (let i = 0; i < Math.min(15, table.length); i++) {
    const c = findColumns(table[i]);
    if (c.date != null && c.amount != null) { headerRow = i; cols = c; break; }
  }
  if (headerRow < 0) throw new ImportFormatError((table[0] ?? []).map((v) => String(v ?? "")).filter(Boolean).slice(0, 12));

  const body = table.slice(headerRow + 1);
  const get = (row: Cell[], c: Column) => (cols[c] == null ? "" : row[cols[c]!]);
  // one decision per file: a comma anywhere in the amount column means German decimals
  const decimalComma = body.some((r) => typeof get(r, "amount") === "string" && String(get(r, "amount")).includes(","));

  const rows: ImportedTxn[] = [];
  const accounts = new Set<string>();
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const row of body) {
    if (!row || row.every((v) => v == null || String(v).trim() === "")) continue;
    const date = parseDate(get(row, "date"));
    const amount = parseAmount(get(row, "amount"), decimalComma);
    const currency = String(get(row, "currency") ?? "").trim().toUpperCase();
    if (!date || amount == null || amount === 0 || (currency && currency !== "EUR")) { skipped++; continue; }

    const account = String(get(row, "account") ?? "").trim().slice(0, 80) || "Finanzguru";
    const payeeRaw = String(get(row, "payee") ?? "").trim();
    const memo = String(get(row, "memo") ?? "").replace(/\s+/g, " ").trim();
    const { category, transfer } = categoryFor(String(get(row, "category") ?? ""), String(get(row, "subcategory") ?? ""), payeeRaw, memo, amount);
    const cents = Math.round(amount * 100);

    // identical rows (two coffees, same day, same price) are real and both count:
    // the n-th repetition gets its own key, in file order
    const base = hash([account, date, cents, norm(payeeRaw), norm(memo)].join("|"));
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    const payee = payeeRaw ? cleanMerchant(payeeRaw) : "";
    accounts.add(account);
    rows.push({
      importKey: `fg:${base}:${n}`,
      account,
      date,
      kind: amount > 0 ? "income" : "expense",
      amount: Math.abs(cents) / 100,
      category,
      note: [payee, memo].filter(Boolean).join(" · ").slice(0, 160),
      transfer,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, accounts: [...accounts].sort((a, b) => a.localeCompare(b, "de")), skipped };
}

/* ---------------- CSV ---------------- */

/** RFC-4180-ish CSV with ; , or tab, quoted fields and a BOM */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, first.split(d).length] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
