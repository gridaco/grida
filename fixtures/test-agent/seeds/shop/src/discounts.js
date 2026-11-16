/** Known discount codes and their percentage off. */
export const DISCOUNTS = {
  SAVE10: 10,
  HALF: 50,
};

export function discountPercent(code) {
  return DISCOUNTS[code] ?? 0;
}
