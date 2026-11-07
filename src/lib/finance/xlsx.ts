import JSZip from "@/lib/reports/vendor/jszip.min";
import type { Cell } from "./finanzguru";

/**
 * Minimal .xlsx reader for the browser: the first worksheet as a table of
 * cell values. Strings come from the shared-strings table or inline strings;
 * numbers (including dates, which Excel stores as day serials) stay numbers.
 * Formatting, formulas and other sheets are ignored — an export needs none.
 */

const MAX_XML = 80 * 1024 * 1024;
const MAX_ROWS = 100_000;

const xml = (text: string) => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("xlsx");
  return doc;
};
const all = (el: Document | Element, tag: string) => Array.from(el.getElementsByTagNameNS("*", tag));
const text = (el: Element) => all(el, "t").map((t) => t.textContent ?? "").join("");

/** "B12" → 1 (zero-based column) */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(file: Blob): Promise<Cell[][]> {
  const zip = await JSZip.loadAsync(file);
  const read = async (path: string) => {
    const entry = zip.file(path);
    if (!entry) return null;
    if ((entry._data?.uncompressedSize ?? 0) > MAX_XML) throw new Error("xlsx-too-large");
    return entry.async("string");
  };

  // the first sheet listed in the workbook, resolved through its relationship
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const first = all(xml(workbook), "sheet")[0];
    const rid = first?.getAttribute("r:id") ?? first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = all(xml(rels), "Relationship").find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }

  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = sharedXml ? all(xml(sharedXml), "si").map(text) : [];
  const sheetXml = await read(sheetPath);
  if (!sheetXml) throw new Error("xlsx");

  const table: Cell[][] = [];
  const rows = all(xml(sheetXml), "row");
  if (rows.length > MAX_ROWS) throw new Error("xlsx-too-large");
  rows.forEach((row, i) => {
    const r = Number(row.getAttribute("r")) || i + 1;
    const cells: Cell[] = [];
    let next = 0;
    for (const c of all(row, "c")) {
      const ref = c.getAttribute("r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = c.getAttribute("t");
      const v = all(c, "v")[0]?.textContent ?? "";
      let value: Cell = null;
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = text(c);
      else if (type === "b") value = v === "1";
      else if (type === "str" || type === "e") value = v;
      else if (v !== "") value = Number.isFinite(Number(v)) ? Number(v) : v;
      cells[col] = value;
    }
    table[r - 1] = cells;
  });
  // rows Excel skipped (empty) become empty arrays rather than holes
  return Array.from(table, (row) => row ?? []);
}
