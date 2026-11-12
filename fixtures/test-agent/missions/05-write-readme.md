# Document the module

## Request

Write a README.md for this project. Document every exported function with one short example each, and how to run the tests.

## Criteria

- Covers `subtotal`, `total`, `receipt`, `formatPrice`, `discountPercent`.
- Examples are correct for the current code, or note the discount bug honestly.
- Explains how to run the tests.

## Run

```json
{
  "seed": "shop",
  "preset": "default",
  "checks": [
    "contains README.md subtotal",
    "contains README.md receipt",
    "contains README.md formatPrice",
    "contains README.md discountPercent"
  ],
  "prompts": [
    "Write a README.md for this project. Document every exported function with one short example each, and how to run the tests."
  ]
}
```
