const DIGIT_MAP: Record<string, string> = {};
// Bengali (U+09E6..U+09EF), Arabic-Indic (U+0660..U+0669), Extended Arabic-Indic (U+06F0..U+06F9), Devanagari (U+0966..U+096F)
for (const start of [0x09e6, 0x0660, 0x06f0, 0x0966]) {
  for (let i = 0; i < 10; i++) DIGIT_MAP[String.fromCharCode(start + i)] = String(i);
}

/** '৫০০.৫' → '500.5'. Also strips thousands separators and stray spaces. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[০-৯٠-٩۰-۹०-९]/g, (ch) => DIGIT_MAP[ch] ?? ch)
    .replace(/[,\s]/g, '')
    .replace(/[।]/g, '.');
}

/** Parses a user-typed amount in any supported digit script. Returns null when not a non-negative number. */
export function parseAmount(input: string): number | null {
  const cleaned = normalizeDigits(String(input ?? '').trim());
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Formats taka for display: 1234.5 → '1,234.50 ৳' (or '১,২৩৪.৫০ ৳' in Bengali). */
export function formatTk(amount: number, lang: 'bn' | 'en' = 'en', fractionDigits = 2): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const text = safe.toLocaleString('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  return `${lang === 'bn' ? toBengaliDigits(text) : text} ৳`;
}

export function formatCount(value: number, lang: 'bn' | 'en' = 'en'): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  return lang === 'bn' ? toBengaliDigits(text) : text;
}
