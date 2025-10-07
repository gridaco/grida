# @grida/sequence

Fractional indexing implementation for CRDT-based ordered lists.

## Features

- Generate lexicographically ordered keys between any two positions
- Base-16 (hexadecimal) encoding for compact keys
- Support for generating multiple keys at once
- Deterministic key generation

## Usage

```typescript
import { generateKeyBetween, generateNKeysBetween } from "@grida/sequence";

// Generate a key between two positions
const key1 = generateKeyBetween(null, null); // First key
const key2 = generateKeyBetween(key1, null); // Key after key1
const key3 = generateKeyBetween(key1, key2); // Key between key1 and key2

// Generate multiple keys at once
const keys = generateNKeysBetween(null, null, 5); // Generate 5 keys

// Optionally use a custom digit set
const customDigits = "0123456789";
const key = generateKeyBetween(null, null, customDigits);
```

## API

### `generateKeyBetween(a, b, digits?)`

Generate a single key between `a` and `b`.

- `a`: Start position (null for beginning)
- `b`: End position (null for end)
- `digits`: Character set to use (defaults to base-16: `"0123456789abcdef"`)

### `generateNKeysBetween(a, b, n, digits?)`

Generate `n` keys between `a` and `b`.

- `a`: Start position (null for beginning)
- `b`: End position (null for end)
- `n`: Number of keys to generate
- `digits`: Character set to use (defaults to base-16: `"0123456789abcdef"`)

## License

CC0 (no rights reserved)
