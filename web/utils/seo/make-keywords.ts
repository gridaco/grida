export default function makeKeywords(keywords: string | string[]): string {
  if (Array.isArray(keywords)) {
    return keywords.join(", ");
  }
  return keywords;
}
