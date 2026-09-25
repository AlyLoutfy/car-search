/**
 * Read facts sellers only state in free text — Egyptian customs tax and battery health — out of an
 * ad description written in Egyptian Arabic, English, or a mix of both.
 *
 * The readers are conservative on purpose: only an explicit statement yields a definite answer, and
 * anything vague comes back as unknown. Callers treat unknown as "keep the listing", so a phrase
 * the rules don't recognise costs one extra message, never a phone you would have wanted.
 */

export type TaxStatus = 'owed' | 'clear' | 'unknown';

export interface BatteryReading {
  readonly percent: number;
  /**
   * `explicit` — tied to a battery keyword ("بطارية ٩٨", "Battery Health: 97%", "100 B").
   * `inferred` — a bare percentage in a phone ad ("256GB 98%"), which is nearly always battery
   * health but could be "condition 90%". Only an explicit reading may fail a listing.
   */
  readonly confidence: 'explicit' | 'inferred';
}

/**
 * Fold the spelling variation out of Arabic text so one pattern covers every way people type a
 * word: Arabic-Indic digits → ASCII, alef/teh-marbuta/yeh variants unified, diacritics, tatweel and
 * the invisible bidi marks that phone keyboards sprinkle around digits removed.
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٪/g, '%')
    .replace(/[؜​-‏‪-‮⁦-⁩﻿ـً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// ── Tax ─────────────────────────────────────────────────────────────────────────────────────────
// Imported phones owe customs tax (~18,000 EGP on an iPhone 17) after a grace period, so sellers
// state it. Written against normalised text (ة→ه, ى→ي, أ→ا). "ضربه" (a dent) is deliberately not a
// tax spelling — "عليه ضربه" means "it has a dent".
const TAX = String.raw`(?:ال)?(?:ضريب|ضرايب|ضرائب|ضربيه|ضرببه)`;
const NOT_ARABIC_LETTER = String.raw`(?<![ء-ي])`;

const TAX_OWED: readonly RegExp[] = [
  // "عليه ضريبه" / "وعليه ضريبه" / "علية ضريبة" — "it has tax on it". Not "مش عليه ضريبه" (it
  // doesn't), and "معليهوش" can't match because the م sits right before عليه.
  new RegExp(String.raw`(?<!(?:مش|مفيش|مافيش)\s+)${NOT_ARABIC_LETTER}و?(?:عليه|عليها)\s+${TAX}`),
  // "مش مدفوع ضريبه", "غير مدفوع الضريبه", "لم يتم دفع الضريبه"
  new RegExp(String.raw`(?:مش|غير)\s+(?:مدفوع|مدفوعه|خالص|متدفع)\s+${TAX}`),
  new RegExp(String.raw`${TAX}\S*\s+(?:مش|غير)\s+(?:مدفوع|مدفوعه|متدفع)`),
  new RegExp(String.raw`لم\s+يتم\s+دفع\s+${TAX}`),
  // A tax amount still to pay: "ضريبه ١٨ الف", "ضريبه 18k", "ضريبه ١٨٠٠٠" — but not "دفعت ضريبه ١٨ الف".
  new RegExp(
    String.raw`(?<!(?:مدفوع|دفعت|خالص|دافع)\s+)${TAX}\S*\s+\d{1,2}(?:[,.]?\d{3}|\s*(?:k|الف|الاف|لاف))(?!\d)`,
  ),
  // Grace period / exemption window still running: "فتره السماح", "مده الاعفاء".
  /فتر[هت]\s*(?:ال)?سماح/,
  /(?:مده|فتره)\s*(?:ال)?اعفاء/,
  // It will be cut off: "هيقف ضريبه".
  new RegExp(String.raw`هي(?:ت)?(?:قف|قفل)\s+${TAX}`),
  // The buyer pays: "اللي هياخده يدفعها", "تدفع بعد شهرين", "والدفع بعد ٤ شهور", "فاضل ٣ شهور ع السداد".
  new RegExp(String.raw`(?<!مش\s+)${NOT_ARABIC_LETTER}(?:ي|هي)دفعها`),
  /تدفع\s+(?:خلال|بعد|كمان)/,
  /والدفع\s+بعد/,
  /فاضل[^.\n]{0,30}?(?:ع|علي)\s*السداد/,
  // English: "Customs/tax: 18,000 EGP, due in 3 months", "tax not paid", "has tax".
  /\b(?:tax|taxes|customs)\b[^.\n]{0,40}?\b(?:due|unpaid|not paid|required|to be paid)\b/,
  /\b(?:customs\/)?tax\s*:\s*\d/,
  /\b(?:has|with|plus)\s+(?:tax|customs)\b(?!\s+(?:paid|payed|cleared|free|exempt))/,
];

const TAX_CLEAR: readonly RegExp[] = [
  // "معفي ضريبه", "معفى من الضرايب", "معفى رسمى" — exempt.
  new RegExp(String.raw`${NOT_ARABIC_LETTER}و?معفي`),
  // "مدفوع ضريبه", "خالص الضريبه", "خلصان ضريبة", "دفعت الضريبه" — paid. Not "مش مدفوع ضريبه".
  new RegExp(
    String.raw`(?<!(?:مش|غير)\s+)${NOT_ARABIC_LETTER}و?(?:مدفوع|مدفوعه|خالص|خلصان|دافع|دفعت|مسدد)\s+${TAX}`,
  ),
  // "الضريبه مدفوعه بالكامل"
  new RegExp(String.raw`${TAX}\S*\s+(?:مدفوعه|مدفوع|خالصه|اتدفعت|متدفعه)`),
  // "زيرو ضريبه", "من غير ضريبة", "مفيهوش ضريبه", "معليهوش جنيه ضريبه", "مش عليه ضريبه".
  new RegExp(String.raw`(?:زيرو|زبورو|بدون|من غير|مفيهوش|مفيش|مافيش|ملهوش)\s+${TAX}`),
  new RegExp(String.raw`(?:معليهوش|معليهاش|مش عليه|مش عليها)\s+(?:\S+\s+)?${TAX}`),
  // English: "tax paid", "TAX PAYED", "Customs paid", "no taxes", "Zero taxis", "zero vat", "tax free".
  /\b(?:tax|taxes|customs|vat)\s+(?:is\s+)?(?:paid|payed|cleared|exempt|free)\b/,
  /\b(?:no|zero|without)\s+(?:tax|taxes|taxis|vat|customs)\b/,
  /\btax[- ]free\b/,
];

// The grace period hasn't even started ("ضريبه متحطش فيه خط"). Only counted within the same
// clause as a tax word: "the line isn't activated yet" is common in ads for reasons that have
// nothing to do with tax, and a tax word elsewhere in the ad doesn't connect the two.
const NOT_YET_ACTIVATED = String.raw`(?:متحطش\s+في(?:ه|ها)?\s+(?:خط|شريحه)|متفعلتش|لم\s+يتم\s+تفعيل)`;
const SAME_CLAUSE = String.raw`[^.,،\n]{0,25}?`;
const TAX_NOT_YET_ACTIVATED = new RegExp(
  String.raw`${TAX}${SAME_CLAUSE}${NOT_YET_ACTIVATED}|${NOT_YET_ACTIVATED}${SAME_CLAUSE}${TAX}`,
);

/**
 * Decide whether a description says tax is still owed on the phone.
 *
 * An explicit "owed" statement wins over a "clear" one in the same ad ("with tax it's 43, tax paid
 * it's 60" still says it has tax on it). Everything else that mentions no tax is unknown.
 */
export function readTaxStatus(description: string | null): TaxStatus {
  if (!description) return 'unknown';
  const text = normalizeArabic(description);

  if (TAX_OWED.some((pattern) => pattern.test(text))) return 'owed';
  if (TAX_CLEAR.some((pattern) => pattern.test(text))) return 'clear';
  // After the clear patterns: "معفي ضريبه لسه متفعلتش" is exempt, just not switched on yet.
  if (TAX_NOT_YET_ACTIVATED.test(text)) return 'owed';
  return 'unknown';
}

// ── Battery health ──────────────────────────────────────────────────────────────────────────────
const BATTERY_WORD = String.raw`(?:\b(?:battery(?:\s+(?:health|life))?|batt|bt)|(?:صحه\s+|حاله\s+)?(?:ال)?(?:بطاري|بطري)ه?)`;
const PERCENT = String.raw`(?<![\d.,])(\d{2,3})(?!\d)`;

const EXPLICIT_FORMS: readonly RegExp[] = [
  // Keyword then number: "بطاريه ٩٨", "Battery Health: 97%", "Bt:100%", "بطارية. 96", "بطاريه %100".
  new RegExp(String.raw`${BATTERY_WORD}\s*[:.\-=]?\s*%?\s*${PERCENT}`, 'g'),
  // Number then keyword: "100% battery", "100 B", "100% Battery Health".
  new RegExp(String.raw`${PERCENT}\s*%?\s*(?:\bbattery|\bbt\b|\bb\b|بطاري)`, 'g'),
  // A lone "B" is too short to trust without a percent sign: "B 98%".
  new RegExp(String.raw`\bb\s*[:.]?\s*${PERCENT}\s*%`, 'g'),
];
// Last resort: any percentage at all ("256GB 98%").
const BARE_PERCENT = new RegExp(String.raw`${PERCENT}\s*%`, 'g');

interface Found {
  readonly percent: number;
  readonly index: number;
}

function firstPlausible(text: string, pattern: RegExp): Found | null {
  for (const match of text.matchAll(pattern)) {
    const percent = Number(match[1]);
    // Battery health lives between ~70 and 100; anything else is a storage size, a charge-cycle
    // count or a model number ("17 B 100%").
    if (percent >= 50 && percent <= 100) return { percent, index: match.index ?? 0 };
  }
  return null;
}

/** Find the battery-health percentage a seller states, or null when they don't. */
export function readBatteryHealth(description: string | null): BatteryReading | null {
  if (!description) return null;
  const text = normalizeArabic(description);

  // Earliest explicit mention wins: the spec line ("Battery: 94%") comes before any later sales
  // talk ("battery performs like 100%").
  const explicit = EXPLICIT_FORMS.map((pattern) => firstPlausible(text, pattern))
    .filter((found): found is Found => found !== null)
    .sort((a, b) => a.index - b.index)[0];
  if (explicit) return { percent: explicit.percent, confidence: 'explicit' };

  const inferred = firstPlausible(text, BARE_PERCENT);
  return inferred && { percent: inferred.percent, confidence: 'inferred' };
}
