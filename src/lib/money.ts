import { useEmber } from "./store";

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * An amount in euros, written the way the interface language writes it:
 * "1.850 €" and "484,20 €" in German, "€1,850" and "€484.20" in English.
 * Whole amounts drop the cents.
 *
 * The language is read when the amount is formatted. Every component that
 * shows money also translates text, so it re-renders when the language
 * changes, and the amounts follow with it.
 */
export function eur(n: number): string {
  const de = useEmber.getState().settings.language === "de";
  const whole = n % 1 === 0;
  const key = `${de}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    // both bounds given: an engine that defaults the currency minimum to 2
    // must not see a maximum of 0 below it (older Safari threw on that)
    const digits = whole ? 0 : 2;
    f = new Intl.NumberFormat(de ? "de-DE" : "en-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, f);
  }
  return f.format(n);
}
