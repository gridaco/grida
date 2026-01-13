/**
 * Picks a language from a supported list (case-insensitive).
 */
export function select_lang<T extends string>(
  wanted_lang: unknown,
  supported_languages: readonly T[],
  fallback_lang: T
): T {
  if (typeof wanted_lang !== "string") return fallback_lang;
  const v = wanted_lang.toLowerCase();
  return (supported_languages as readonly string[]).includes(v)
    ? (v as T)
    : fallback_lang;
}

