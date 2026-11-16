import { discountPercent } from "./discounts.js";
import { formatPrice } from "./format.js";

/** Subtotal of the cart in cents. */
export function subtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/** Total in cents after an optional discount code. */
export function total(items, code) {
  const percent = discountPercent(code);
  return subtotal(items) - percent;
}

/** A one-line receipt, e.g. "3 items, $12.50". */
export function receipt(items, code) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return `${count} items, ${formatPrice(total(items, code))}`;
}
