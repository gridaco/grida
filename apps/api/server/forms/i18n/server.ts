import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

/**
 * server only
 * @param availableLocales list of available locales
 * @param defaultLocale default locale
 * @returns
 */
export async function getLocale<T extends string = string>(
  requestHeaders: Headers,
  availableLocales: T[],
  defaultLocale: T = "en" as T
): Promise<T> {
  const headersList = requestHeaders;
  const _headers = {
    "accept-language": headersList.get("accept-language") || "",
  };

  // Negotiator can return "*" for an absent/wildcard header, and accepts
  // malformed tags that Intl rejects. Public API callers need a fallback too.
  const languages = new Negotiator({ headers: _headers })
    .languages()
    .flatMap((language) => {
      try {
        return Intl.getCanonicalLocales(language);
      } catch {
        return [];
      }
    });

  const locale = match(languages, availableLocales, defaultLocale);

  return locale as T;
}
