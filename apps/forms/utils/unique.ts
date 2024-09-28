/**
 * Returns a unique array of elements from the given array `arr`.
 * If `fn` is provided, it will use `fn` to determine uniqueness.
 * If `fn` is 'deep', it will perform a deep comparison of objects.
 *
 * @template T - Type of array elements
 * @param {T[]} arr - The array from which to extract unique elements
 * @param {((item: T) => string) | 'deep'} [fn] - An optional function or string to determine uniqueness.
 * - If `fn` is a function, it will use the return value of the function for uniqueness check.
 * - If `fn` is 'deep', it will perform a deep comparison of objects.
 * @returns {T[]} An array of unique elements based on the given criteria.
 */
export function unique<T>(arr: T[], fn?: ((item: T) => string) | "deep"): T[] {
  if (fn === "deep") {
    // Deep comparison
    return arr.filter(
      (item, index, self) =>
        index ===
        self.findIndex((t) => JSON.stringify(t) === JSON.stringify(item))
    );
  }

  if (typeof fn === "function") {
    // Custom uniqueness based on the function
    const seen = new Set<string>();
    return arr.filter((item) => {
      const key = fn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Default behavior (shallow unique)
  return Array.from(new Set(arr));
}
