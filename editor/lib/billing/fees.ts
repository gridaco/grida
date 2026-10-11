// Credit display helpers. Charging, credit policy and admission live in Platform.

/** Existing low-balance threshold shown by credit indicators. */
export const AI_GATE_FLOOR_CENTS = 25;

/** Display helper: cents → "$X.XX". */
export function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
