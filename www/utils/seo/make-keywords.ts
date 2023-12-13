export function keywords(keywords: string | string[]): string {
  if (Array.isArray(keywords)) {
    return keywords.join(", ");
  }
  return keywords;
}
