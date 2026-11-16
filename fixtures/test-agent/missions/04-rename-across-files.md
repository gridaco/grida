# Rename across files

## Request

Rename `formatPrice` to `formatMoney` everywhere in the project, including its definition, imports and doc comments. Fix the failing tests too, and make sure everything passes.

## Criteria

- No `formatPrice` remains anywhere.
- The rename touches the definition and every import.
- The suite passes.

## Run

```json
{
  "seed": "shop",
  "preset": "default",
  "checks": ["tests-pass", "absent . formatPrice", "contains src formatMoney"],
  "prompts": [
    "Rename `formatPrice` to `formatMoney` everywhere in the project, including its definition, imports and doc comments. Fix the failing tests too, and make sure everything passes."
  ]
}
```
