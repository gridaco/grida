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
export function fmt_local_index(local_index: number): string {
  return "#" + pad_number(local_index, 3);
}

/**
 * Pads the given number with leading zeros up to the specified total length.
 * This function converts the number to a string and adds zeros at the beginning
 * until the total length of the string reaches the specified pad length.
 *
 * @param n The number to pad with leading zeros.
 * @param pad The total length of the output string. If the number has fewer digits
 *            than this length, leading zeros are added to reach this length.
 * @returns A string representation of the number, padded with leading zeros
 *          to the specified total length.
 *
 * @example
 * // returns '0000'
 * pad_number(0, 4);
 *
 * @example
 * // returns '0001'
 * pad_number(1, 4);
 *
 * @example
 * // returns '0010'
 * pad_number(10, 4);
 */
export function pad_number(n: number, pad: number): string {
  return n.toString().padStart(pad, "0");
}

// async function hashText(text: string) {
//     const encoder = new TextEncoder();
//     const data = encoder.encode(text);
//     const hash = await crypto.subtle.digest('SHA-256', data);
//     return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
// }

// // Usage
// hashText('Hello, world!').then(console.log);  // Outputs the SHA-256 hash of "Hello, world!"
