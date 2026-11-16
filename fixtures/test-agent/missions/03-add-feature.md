# Add a feature with tests

## Request

Add free shipping: orders with a subtotal of $50 or more ship free, smaller orders pay a flat $5.99. Add a `shipping(items)` function and make `receipt` include shipping in its total. Add tests for both cases and keep the existing tests passing (fix anything that is already broken).

## Criteria

- `shipping` returns 0 at or above 5000 cents and 599 below.
- `receipt` includes shipping; existing receipt expectations are updated deliberately.
- New tests cover both sides of the threshold; the whole suite passes.

## Run

```json
{
  "seed": "shop",
  "preset": "default",
  "checks": ["tests-pass", "contains src shipping", "contains test 599"],
  "prompts": [
    "Add free shipping: orders with a subtotal of $50 or more ship free, smaller orders pay a flat $5.99. Add a `shipping(items)` function and make `receipt` include shipping in its total. Add tests for both cases and keep the existing tests passing (fix anything that is already broken)."
  ]
}
```
