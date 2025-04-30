import { headers, cookies } from "next/headers";
import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

/**
 * server only
 * @param availableLocales list of available locales
 * @param defaultLocale default locale
 * @returns
 */
export async function getLocale<T extends string = string>(
  availableLocales: T[],
  defaultLocale: T = "en" as T
): Promise<T> {
  const headersList = await headers();
  const _headers = {
    "accept-language": headersList.get("accept-language") || "",
  };

  let languages = new Negotiator({ headers: _headers }).languages();

  const locale = match(languages, availableLocales, defaultLocale);

  return locale as T;
}
