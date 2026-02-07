/**
 * Sanitize a display name for the RFC 5322 "From" header.
 * Strips double quotes, angle brackets, backslashes, control characters,
 * and collapses runs of whitespace into a single space.
 */
export function sanitize_email_display_name(name: string): string {
  return name
    .replace(/["<>\\]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
