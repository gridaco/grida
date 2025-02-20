/**
 * Finds the intersection (common elements) of two arrays containing scalar values.
 *
 * @param {T[]} arr1 - The first array to compare.
 * @param {T[]} arr2 - The second array to compare.
 * @returns {T[]} A new array containing elements that are present in both `arr1` and `arr2`.
 *
 * @example
 * // Example usage with numbers:
 * const array1 = [1, 2, 3];
 * const array2 = [0, 2, 10];
 * const result = intersect(array1, array2);
 * console.log(result); // Output: [2]
 *
 * @example
 * // Example usage with strings:
 * const array1 = ['a', 'b', 'c'];
 * const array2 = ['b', 'c', 'd'];
 * const result = intersect(array1, array2);
 * console.log(result); // Output: ['b', 'c']
 */
export function intersect<T extends string | number | boolean>(
  arr1: T[],
  arr2: T[]
): T[] {
  return arr1.filter((value) => arr2.includes(value));
}
