/**
 * Pure display helpers for AI credit balance & USD values.
 *
 * No state, no env dependency — these may be imported from server or
 * client modules. The controller and hook use them internally; consumers
 * usually reach for `useAiCredits().formatted` instead.
 */

/**
 * Chip-style: `$X.X` or `$0` — trims the trailing zero of `.XX0`.
 * Returns `null` for `null` cents so callers can render `"—"`.
 */
export function chip(cents: number | null): string | null {
  if (cents === null) return null;
  const s = (cents / 100).toFixed(2);
  return `$${s.endsWith("0") ? s.slice(0, -1) : s}`;
}

/**
 * Exact balance — 4 decimal places. Used for tooltip/hover.
 * Returns `null` for `null` cents.
 */
export function exact(cents: number | null): string | null {
  if (cents === null) return null;
  return `$${(cents / 100).toFixed(4)}`;
}

/**
 * High-precision USD for sub-cent costs. 6 decimals, trailing zeros
 * trimmed. Returns `"$0"` for exact zero, `"<$0.000001"` for tiny
 * positive values that would otherwise round to zero.
 */
export function usd(value: number): string {
  if (value === 0) return "$0";
  if (value > 0 && value < 0.000001) return "<$0.000001";
  return `$${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}
