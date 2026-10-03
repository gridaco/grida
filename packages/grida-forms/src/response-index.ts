/** Human-readable response index: a hash prefix and at least three digits. */
export function formatResponseIndex(index: number): string {
  return "#" + index.toString().padStart(3, "0");
}
