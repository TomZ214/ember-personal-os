/**
 * Fuzzy matching for the command palette.
 *
 * A plain `includes()` only finds text you can already spell exactly, which
 * makes a palette feel like a filter box rather than a way of getting places.
 * Raycast, Linear and Superhuman all match on subsequence: "tsk" finds Tasks,
 * "grocs" finds Groceries, "wknd" finds Weekend plans.
 *
 * Returns null when there is no match at all, otherwise a score where higher
 * is better. The exact numbers matter less than the ordering they produce:
 *
 *   1. the whole query appears verbatim, from the start   ("tas" → Tasks)
 *   2. verbatim at a word boundary                        ("mail" → Local Mail)
 *   3. verbatim mid-word                                  ("ail"  → Mail)
 *   4. scattered subsequence, rewarded for landing on word starts and for
 *      staying contiguous                                 ("lm"   → Local Mail)
 *
 * Shorter texts win ties, because matching three letters of a four-letter
 * title is a tighter fit than three letters of a paragraph.
 */

const VERBATIM_AT_START = 1000;
const VERBATIM_AT_WORD = 880;
const VERBATIM_MIDWORD = 720;

function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  return /[\s\-_/.,:(]/.test(text[i - 1]);
}

export function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0;
  if (!text) return null;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  const idx = t.indexOf(q);
  if (idx !== -1) {
    const base =
      idx === 0 ? VERBATIM_AT_START : isBoundary(t, idx) ? VERBATIM_AT_WORD : VERBATIM_MIDWORD;
    // a match that covers most of the text beats one buried in a long string
    return base + Math.round((q.length / t.length) * 100);
  }

  // subsequence: every query character must appear, in order
  let cursor = 0;
  let points = 0;
  let run = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, cursor);
    if (at === -1) return null;
    if (isBoundary(t, at)) points += 30; // initials are how people actually abbreviate
    run = at === cursor ? run + 1 : 0;
    points += run * 6; // contiguous letters are a stronger signal than scattered ones
    cursor = at + 1;
  }
  // never let a scattered match outrank a verbatim one
  return Math.min(points + Math.max(0, 60 - t.length), VERBATIM_MIDWORD - 1);
}

/** Best score across several fields — a title hit should outrank a body hit. */
export function bestScore(query: string, ...fields: (string | undefined)[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f) continue;
    const s = fuzzyScore(f, query);
    if (s === null) continue;
    // later fields are secondary (body, sender) and are worth slightly less,
    // so a title match always wins over the same match in a body
    const weighted = s - i * 40;
    if (best === null || weighted > best) best = weighted;
  }
  return best;
}
