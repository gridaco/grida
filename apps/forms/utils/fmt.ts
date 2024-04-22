import { capitalCase, snakeCase } from "change-case";

export function fmt_snake_case_to_human_text(input: string) {
  if (!input) {
    return "";
  }
  // Converts to snake_case then replaces underscores with spaces and capitalizes words
  return capitalCase(snakeCase(input)).toLowerCase();
}

/**
 * Returns a hashed local id with at least 3 digits, prefixed by #.
 * This ensures the output string is always at least four characters long, including the #.
 * Examples:
 * - 1 -> #001
 * - 12 -> #012
 * - 123 -> #123
 * - 1234 -> #1234
 */
export function fmt_hashed_local_id(local_id: number): string {
  const formattedId = local_id.toString().padStart(3, "0");
  return `#${formattedId}`;
}
