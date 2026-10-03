import { headers } from "next/headers";
import { getLocale as matchLocale } from "@workspace/translations/forms";

/** Binds the shared locale matcher to the current Next.js request. */
export async function getLocale<T extends string = string>(
  availableLocales: readonly T[],
  defaultLocale: T = "en" as T
): Promise<T> {
  return matchLocale(await headers(), availableLocales, defaultLocale);
}
