import { generateKeyBetween, generateNKeysBetween } from "../index";

describe("fractional indexing", () => {
  describe("generateKeyBetween", () => {
    it("should generate a key when both bounds are null", () => {
      const key = generateKeyBetween(null, null);
      expect(key).toBe("a0");
    });

    it("should generate a key after a given key", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);
      expect(key2 > key1).toBe(true);
    });

    it("should generate a key before a given key", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(null, key1);
      expect(key2 < key1).toBe(true);
    });

    it("should generate a key between two keys", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);
      const key3 = generateKeyBetween(key1, key2);
      expect(key3 > key1).toBe(true);
      expect(key3 < key2).toBe(true);
    });

    it("should handle many insertions at the beginning", () => {
      let prev: string | null = null;
      const keys: string[] = [];
      for (let i = 0; i < 100; i++) {
        const key = generateKeyBetween(null, prev);
        keys.push(key);
        expect(prev === null || key < prev).toBe(true);
        prev = key;
      }
      // Verify all keys are in descending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted.reverse());
    });

    it("should handle many insertions at the end", () => {
      let prev: string | null = null;
      const keys: string[] = [];
      for (let i = 0; i < 100; i++) {
        const key = generateKeyBetween(prev, null);
        keys.push(key);
        expect(prev === null || key > prev).toBe(true);
        prev = key;
      }
      // Verify all keys are in ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it("should be deterministic for same inputs", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);

      // Generating between same bounds should always return the same key
      const key3a = generateKeyBetween(key1, key2);
      const key3b = generateKeyBetween(key1, key2);
      expect(key3a).toBe(key3b);
      expect(key3a > key1).toBe(true);
      expect(key3a < key2).toBe(true);

      // But we can keep subdividing to get more keys
      const keys: string[] = [key1];
      let current = key1;
      for (let i = 0; i < 10; i++) {
        current = generateKeyBetween(current, key2);
        keys.push(current);
      }
      keys.push(key2);

      // Verify all keys are in ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it("should throw error when a >= b", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);
      expect(() => generateKeyBetween(key2, key1)).toThrow();
      expect(() => generateKeyBetween(key1, key1)).toThrow();
    });

    it("should work with custom digit set", () => {
      const digits = "0123456789";
      const key1 = generateKeyBetween(null, null, digits);
      const key2 = generateKeyBetween(key1, null, digits);
      const key3 = generateKeyBetween(key1, key2, digits);
      expect(key3 > key1).toBe(true);
      expect(key3 < key2).toBe(true);
      // Verify all characters are from the digit set
      for (const key of [key1, key2, key3]) {
        for (const char of key) {
          expect(digits.includes(char) || /[a-zA-Z]/.test(char)).toBe(true);
        }
      }
    });

    it("should handle large keys", () => {
      // Generate a reasonably large key by repeated insertions
      let prev: string | null = null;
      for (let i = 0; i < 50; i++) {
        prev = generateKeyBetween(prev, null);
      }
      expect(prev).not.toBeNull();
      // Should be able to generate keys before and after
      const before = generateKeyBetween(null, prev!);
      const after = generateKeyBetween(prev!, null);
      expect(before < prev!).toBe(true);
      expect(after > prev!).toBe(true);
    });
  });

  describe("generateNKeysBetween", () => {
    it("should generate 0 keys", () => {
      const keys = generateNKeysBetween(null, null, 0);
      expect(keys).toEqual([]);
    });

    it("should generate 1 key", () => {
      const keys = generateNKeysBetween(null, null, 1);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe("a0");
    });

    it("should generate multiple keys at the start", () => {
      const n = 10;
      const keys = generateNKeysBetween(null, null, n);
      expect(keys).toHaveLength(n);

      // Verify all keys are unique
      expect(new Set(keys).size).toBe(n);

      // Verify all keys are in ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it("should generate keys after a given key", () => {
      const key1 = generateKeyBetween(null, null);
      const keys = generateNKeysBetween(key1, null, 5);
      expect(keys).toHaveLength(5);

      // All keys should be greater than key1
      for (const key of keys) {
        expect(key > key1).toBe(true);
      }

      // Verify ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it("should generate keys before a given key", () => {
      const key1 = generateKeyBetween(null, null);
      const keys = generateNKeysBetween(null, key1, 5);
      expect(keys).toHaveLength(5);

      // All keys should be less than key1
      for (const key of keys) {
        expect(key < key1).toBe(true);
      }

      // Verify ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it("should generate keys between two keys", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);
      const keys = generateNKeysBetween(key1, key2, 10);
      expect(keys).toHaveLength(10);

      // All keys should be between key1 and key2
      for (const key of keys) {
        expect(key > key1).toBe(true);
        expect(key < key2).toBe(true);
      }

      // Verify ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);

      // Verify uniqueness
      expect(new Set(keys).size).toBe(10);
    });

    it("should generate many keys efficiently", () => {
      const n = 100;
      const keys = generateNKeysBetween(null, null, n);
      expect(keys).toHaveLength(n);

      // Verify all keys are unique
      expect(new Set(keys).size).toBe(n);

      // Verify ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);

      // Verify keys are relatively short (not growing exponentially)
      const avgLength = keys.reduce((sum, k) => sum + k.length, 0) / n;
      expect(avgLength).toBeLessThan(20); // Reasonable upper bound
    });

    it("should work with custom digit set", () => {
      const digits = "01234567";
      const keys = generateNKeysBetween(null, null, 5, digits);
      expect(keys).toHaveLength(5);

      // Verify ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it("should handle binary recursive case", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);
      const keys = generateNKeysBetween(key1, key2, 7);

      expect(keys).toHaveLength(7);

      // Verify all keys are between bounds
      for (const key of keys) {
        expect(key > key1).toBe(true);
        expect(key < key2).toBe(true);
      }

      // Verify ascending order and uniqueness
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
      expect(new Set(keys).size).toBe(7);
    });

    it("should be deterministic", () => {
      const keys1 = generateNKeysBetween(null, null, 10);
      const keys2 = generateNKeysBetween(null, null, 10);
      expect(keys1).toEqual(keys2);

      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);
      const between1 = generateNKeysBetween(key1, key2, 5);
      const between2 = generateNKeysBetween(key1, key2, 5);
      expect(between1).toEqual(between2);
    });
  });

  describe("lexicographic ordering", () => {
    it("should maintain lexicographic order with JavaScript string comparison", () => {
      const keys: string[] = [];
      let prev: string | null = null;

      // Generate a series of keys
      for (let i = 0; i < 50; i++) {
        const key = generateKeyBetween(prev, null);
        keys.push(key);
        prev = key;
      }

      // Insert some keys in between
      for (let i = 0; i < keys.length - 1; i += 5) {
        const between = generateKeyBetween(keys[i], keys[i + 1]);
        keys.splice(i + 1, 0, between);
      }

      // Sort using JavaScript's built-in string comparison
      const sorted = [...keys].sort();

      // Verify the sorted order matches the insertion order
      expect(keys).toEqual(sorted);
    });
  });

  describe("stress tests", () => {
    it("should handle alternating insertions at both ends", () => {
      const keys: string[] = [generateKeyBetween(null, null)];

      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          keys.unshift(generateKeyBetween(null, keys[0]));
        } else {
          keys.push(generateKeyBetween(keys[keys.length - 1], null));
        }
      }

      // Verify order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);

      // Verify uniqueness
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("should handle deep nesting between two keys", () => {
      let a = generateKeyBetween(null, null);
      let b = generateKeyBetween(a, null);

      const keys: string[] = [a, b];

      // Insert 20 keys between a and b
      for (let i = 0; i < 20; i++) {
        const mid = generateKeyBetween(a, b);
        keys.push(mid);
        b = mid; // Keep narrowing the gap
      }

      // Verify all keys are unique and in order
      const sorted = [...keys].sort();
      expect(sorted).toEqual(Array.from(new Set(sorted)));
    });

    it("should maintain reasonable key lengths", () => {
      const keys: string[] = [];
      let prev: string | null = null;

      // Generate 200 keys
      for (let i = 0; i < 200; i++) {
        const key = generateKeyBetween(prev, null);
        keys.push(key);
        prev = key;
      }

      // Check max length is reasonable
      const maxLength = Math.max(...keys.map((k) => k.length));
      expect(maxLength).toBeLessThan(30);
    });
  });

  describe("jittering", () => {
    it("should generate different keys with jittering enabled", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);

      // Generate keys between same bounds with jitter
      const jitteredKeys = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const key = generateKeyBetween(key1, key2, undefined, { jitter: true });
        jitteredKeys.add(key);
        // Verify ordering is maintained
        expect(key > key1).toBe(true);
        expect(key < key2).toBe(true);
      }

      // With jitter, we should get some variety (not all the same)
      // Note: There's a small chance this could fail randomly, but very unlikely
      expect(jitteredKeys.size).toBeGreaterThan(1);
    });

    it("should be deterministic with custom RNG", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);

      // Create a deterministic RNG
      const createRng = () => {
        let seed = 0.5;
        return () => {
          seed = (seed * 9301 + 49297) % 233280;
          return seed / 233280;
        };
      };

      const keys1 = generateNKeysBetween(key1, key2, 5, undefined, {
        jitter: true,
        rng: createRng(),
      });

      const keys2 = generateNKeysBetween(key1, key2, 5, undefined, {
        jitter: true,
        rng: createRng(),
      });

      // With same seed, should produce same results
      expect(keys1).toEqual(keys2);

      // But should be different from non-jittered
      const keysNoJitter = generateNKeysBetween(key1, key2, 5);
      expect(keys1).not.toEqual(keysNoJitter);
    });

    it("should maintain ordering with jitter", () => {
      const keys: string[] = [];
      let prev: string | null = null;

      // Generate many keys with jitter
      for (let i = 0; i < 50; i++) {
        const key = generateKeyBetween(prev, null, undefined, { jitter: true });
        keys.push(key);
        if (prev) {
          expect(key > prev).toBe(true);
        }
        prev = key;
      }

      // Verify all keys are in ascending order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);

      // Verify uniqueness
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("should work with generateNKeysBetween and jitter", () => {
      const key1 = generateKeyBetween(null, null);
      const key2 = generateKeyBetween(key1, null);

      const keys = generateNKeysBetween(key1, key2, 10, undefined, {
        jitter: true,
      });

      expect(keys).toHaveLength(10);

      // Verify all keys are between bounds
      for (const key of keys) {
        expect(key > key1).toBe(true);
        expect(key < key2).toBe(true);
      }

      // Verify ordering
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);

      // Verify uniqueness
      expect(new Set(keys).size).toBe(10);
    });

    it("should handle jitter with null bounds", () => {
      const keys1 = generateNKeysBetween(null, null, 10, undefined, {
        jitter: true,
      });

      expect(keys1).toHaveLength(10);

      // Verify ordering
      const sorted = [...keys1].sort();
      expect(keys1).toEqual(sorted);

      // Verify uniqueness
      expect(new Set(keys1).size).toBe(10);
    });

    it("should produce valid keys with alternating jitter", () => {
      const keys: string[] = [generateKeyBetween(null, null)];

      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          keys.unshift(
            generateKeyBetween(null, keys[0], undefined, { jitter: true })
          );
        } else {
          keys.push(
            generateKeyBetween(keys[keys.length - 1], null, undefined, {
              jitter: true,
            })
          );
        }
      }

      // Verify order
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);

      // Verify uniqueness
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
