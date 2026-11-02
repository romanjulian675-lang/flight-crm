/** Answer choices on the public booking page. Safe to import from client components. Labels live in i18n `book.options`. */
export const BOOK_PROGRAMS = ["private", "instrument", "commercial", "not_sure"] as const;
export const BOOK_EXPERIENCE = ["none", "discovery", "student", "private", "instrument", "commercial"] as const;
export const BOOK_START = ["asap", "1_3_months", "3_6_months", "researching"] as const;
export const BOOK_SCHEDULE = ["full_time", "part_time"] as const;
export const BOOK_PAYMENT = ["self", "loan", "va", "sponsor", "not_sure"] as const;
export const BOOK_VISA = ["yes", "no", "not_sure"] as const;
export const BOOK_CALL_TYPES = ["phone", "video"] as const;
export const BOOK_CALL_LANGUAGES = ["en", "es"] as const;

export type BookProgram = (typeof BOOK_PROGRAMS)[number];

/** Weekdays in display order (Mon first); keys are JS getDay() numbers. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/** `?program=` values we accept (plus a few spellings people will type). */
export function programFromQuery(raw: string | null | undefined): BookProgram | null {
  const s = (raw ?? "").toLowerCase().trim();
  if (/^(private|ppl|privado)/.test(s)) return "private";
  if (/^(instrument|ifr|ir|instrumento)/.test(s)) return "instrument";
  if (/^(commercial|cpl|comercial)/.test(s)) return "commercial";
  return null;
}
