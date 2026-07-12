import type { BankSubscription, BankTxn } from "@/lib/integrations/types";

/**
 * Rule-based transaction categorization tuned for German banking data
 * (counterparty names + remittance lines). Runs anywhere — no server deps.
 */

const RULES: { category: string; pattern: RegExp }[] = [
  { category: "Income", pattern: /gehalt|lohn|salary|besoldung|rente|bafoeg|baf(ö|oe)g|kindergeld/i },
  { category: "Groceries", pattern: /rewe|edeka|aldi|lidl|penny|netto|kaufland|nahkauf|tegut|alnatura|denns|hit\s|globus/i },
  { category: "Drugstore", pattern: /\bdm\b|dm[- ]?drogerie|rossmann|mueller\s?drogerie|m(ü|ue)ller\s/i },
  { category: "Dining", pattern: /restaurant|mcdonald|burger|subway|kfc|pizza|lieferando|wolt|uber\s?eats|caf(e|é)|baecker|b(ä|ae)cker|eiscafe|d(ö|oe)ner|vapiano|starbucks/i },
  { category: "Transport", pattern: /deutsche\s?bahn|db\s?vertrieb|db\s?fernverkehr|rnv|vrn|hvv|mvg|bvg|flixbus|shell|aral|esso|jet\s|total\s?energ|tankstelle|uber(?!\s?eats)|bolt|tier\s|lime\s/i },
  { category: "Shopping", pattern: /amazon(?!\s?prime)|amzn|zalando|otto\s|mediamarkt|saturn|ikea|h&m|c&a|decathlon|thalia|dm-shop|ebay|etsy/i },
  { category: "Subscriptions", pattern: /spotify|netflix|disney|dazn|youtube|apple\.com\/bill|itunes|amazon\s?prime|audible|adobe|google\s?(one|storage)|openai|anthropic|patreon|playstation|xbox|nintendo/i },
  { category: "Housing", pattern: /miete|kaltmiete|nebenkosten|wohnung|hausverwaltung|stadtwerke|swh|vattenfall|eon|e\.on|enbw|rheinenergie|gasag|wasserversorgung/i },
  { category: "Internet & Mobile", pattern: /telekom|vodafone|o2\s|telefonica|1&1|1und1|congstar|aldi\s?talk|pyur|unitymedia/i },
  { category: "Insurance", pattern: /versicherung|allianz|huk|axa|ergo|debeka|techniker\s?krankenkasse|tk\s?beitrag|aok|barmer|dak|ikk|krankenkasse|haftpflicht/i },
  { category: "Health", pattern: /apotheke|arzt|praxis|zahnarzt|klinik|physio|optiker|fielmann/i },
  { category: "Fitness", pattern: /fitness|mcfit|clever\s?fit|gym|urban\s?sports|kletterwerk|verein/i },
  { category: "Broadcasting", pattern: /rundfunk|ard\s?zdf|beitragsservice/i },
  { category: "Cash", pattern: /bargeld|geldautomat|atm|cash\s?group|auszahlung\s?ga/i },
  { category: "Fees", pattern: /entgelt|geb(ü|ue)hr|kontof(ü|ue)hrung|dispozins/i },
  { category: "Savings", pattern: /sparplan|depot|trade\s?republic|scalable|ing\s?diba\s?extra|tagesgeld/i },
];

export function categorize(merchant: string, remittance: string, amount: number): string {
  const haystack = `${merchant} ${remittance}`;
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) return rule.category;
  }
  return amount > 0 ? "Income" : "Other";
}

/** "REWE SAGT DANKE. 44301612//HEIDELBERG/DE" -> "Rewe" */
export function cleanMerchant(raw: string): string {
  if (!raw) return "Unknown";
  let s = raw
    .replace(/\/\/.*$/, "") // trailing //CITY/DE blocks
    .replace(/\b\d{6,}\b/g, "") // long reference numbers
    .replace(/\b(sagt danke|dankt|vielen dank).*/i, "")
    .replace(/\b(gmbh|ag|se|kg|e\.?v\.?|co\.?)\b\.?/gi, "")
    .replace(/[.,]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!s) return "Unknown";
  s = s.slice(0, 40);
  // Title Case for SHOUTING bank strings
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
  }
  return s;
}

/** detect recurring outgoing payments: same merchant, similar amount, >= 2 hits */
export function detectSubscriptions(txns: BankTxn[]): BankSubscription[] {
  const groups = new Map<string, BankTxn[]>();
  for (const t of txns) {
    if (t.amount >= 0 || t.pending) continue;
    const key = t.merchant.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const subs: BankSubscription[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const amounts = list.map((t) => -t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const similar = amounts.every((a) => Math.abs(a - avg) / avg < 0.15);
    if (!similar || avg > 500) continue;
    const dates = list.map((t) => t.date).sort();
    const spanDays = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86_400_000;
    const interval = spanDays / (list.length - 1);
    if (interval < 20 || interval > 40) continue; // roughly monthly
    subs.push({
      merchant: list[0].merchant,
      amount: Math.round(avg * 100) / 100,
      category: list[0].category,
      lastDate: dates[dates.length - 1],
      occurrences: list.length,
    });
  }
  return subs.sort((a, b) => b.amount - a.amount);
}
