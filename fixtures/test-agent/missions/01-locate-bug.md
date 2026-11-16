# Locate a bug without touching files

## Request

Customers report that the cart total is wrong whenever a discount code is used. Find where the total is computed, explain the bug in a sentence or two, and say what the fix would be. Do not change any files.

## Criteria

- Names `src/cart.js` and the `total` function.
- Explains that the percentage is subtracted as cents instead of a share of the subtotal.
- Proposes `subtotal - subtotal * percent / 100` or equivalent.
- Leaves every file unchanged.

## Run

```json
{
  "seed": "shop",
  "preset": "read-only",
  "checks": ["unchanged"],
  "answer": ["cart.js", "percent"],
  "prompts": [
    "Customers report that the cart total is wrong whenever a discount code is used. Find where the total is computed, explain the bug in a sentence or two, and say what the fix would be. Do not change any files."
  ]
}
```
