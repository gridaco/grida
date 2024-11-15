/**
 * Recursively assigns properties from the `source` object to the `target` object,
 * merging deeply nested objects while preserving existing properties in `target`
 * if they are not specified in `source`.
 *
 * @param target - The object to which properties will be assigned.
 * @param source - The object containing properties to assign to `target`.
 *                 Only changed properties will be deeply assigned.
 *
 * @example
 * // Example usage:
 * const target = {
 *   a: 1,
 *   b: { x: 10, y: 20 },
 *   c: { nested: { value: "unchanged" } }
 * };
 *
 * const source = {
 *   b: { y: 30, z: 40 },
 *   c: { nested: { value: "changed" } }
 * };
 *
 * deepAssign(target, source);
 *
 * // Resulting target:
 * // {
 * //   a: 1,
 * //   b: { x: 10, y: 30, z: 40 },
 * //   c: { nested: { value: "changed" } }
 * // }
 */
export function deepAssign(target: any, source: any): any {
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      target[key] = target[key] || {};
      deepAssign(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
