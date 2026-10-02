import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

/** Selects an exact supported language, case-insensitively. */
export function select_lang<T extends string>(
  wanted_lang: unknown,
  supported_languages: readonly T[],
  fallback_lang: T
): T {
  if (typeof wanted_lang !== "string") return fallback_lang;
  const value = wanted_lang.toLowerCase();
  return (supported_languages as readonly string[]).includes(value)
    ? (value as T)
    : fallback_lang;
}

/** Matches an explicit request's language preferences without framework state. */
export function getLocale<T extends string>(
  requestHeaders: Headers,
  availableLocales: readonly T[],
  defaultLocale: T
): T {
  const headers = {
    "accept-language": requestHeaders.get("accept-language") || "",
  };
  const languages = new Negotiator({ headers })
    .languages()
    .flatMap((language) => {
      try {
        return Intl.getCanonicalLocales(language);
      } catch {
        // Wildcards and malformed tags cannot be passed to Intl locale matching.
        return [];
      }
    });
  return match(languages, availableLocales, defaultLocale) as T;
}
