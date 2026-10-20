import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { en, type Dict } from "./en";
import { es } from "./es";

export type Locale = "en" | "es";
export const LOCALE_COOKIE = "fl_lang";
export const dictionaries: Record<Locale, Dict> = { en, es };

/** Locale from the user's choice (cookie), else the browser's Accept-Language, else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (chosen === "en" || chosen === "es") return chosen;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*es\b/i.test(accept) ? "es" : "en";
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}

export type { Dict };
