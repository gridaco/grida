# Context across turns

## Request

Turn 1: Our release codename is HERON. Just remember it for now, don't change anything.

Turn 2: Add src/config.js exporting a constant CODENAME set to our release codename.

## Criteria

- The first turn changes nothing.
- The second turn writes `src/config.js` with `CODENAME = "HERON"` without asking again.

## Run

```json
{
  "seed": "shop",
  "preset": "default",
  "prompts": [
    "Our release codename is HERON. Just remember it for now, don't change anything.",
    "Add src/config.js exporting a constant CODENAME set to our release codename."
  ],
  "checks": ["contains src/config.js HERON"]
}
```
