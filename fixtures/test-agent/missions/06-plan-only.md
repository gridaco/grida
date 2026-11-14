# Plan before acting

## Request

Plan how you would add multi-currency support (USD, EUR, KRW with correct minor units). Do not make any changes yet — just give me the plan.

## Criteria

- A concrete, ordered plan naming the files to change.
- Handles KRW having no minor unit.
- Leaves every file unchanged.

## Run

```json
{
  "seed": "shop",
  "preset": "default",
  "mode": "plan",
  "checks": ["unchanged"],
  "answer": ["KRW"],
  "prompts": [
    "Plan how you would add multi-currency support (USD, EUR, KRW with correct minor units). Do not make any changes yet — just give me the plan."
  ]
}
```
