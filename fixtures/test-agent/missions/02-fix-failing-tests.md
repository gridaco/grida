# Fix the failing tests

## Request

The test suite is failing. Run the tests, find out why, and fix the code — not the tests. Run the tests again to confirm they pass.

## Criteria

- Runs the tests before and after the change.
- Fixes the discount arithmetic in `src/cart.js` only.
- Reports the final passing result.

## Run

```json
{
  "seed": "shop",
  "preset": "default",
  "checks": ["tests-pass", "unchanged test"],
  "prompts": [
    "The test suite is failing. Run the tests, find out why, and fix the code — not the tests. Run the tests again to confirm they pass."
  ]
}
```
