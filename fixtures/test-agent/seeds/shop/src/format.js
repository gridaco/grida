/** Format an amount in cents as dollars, e.g. 1250 → "$12.50". */
export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
