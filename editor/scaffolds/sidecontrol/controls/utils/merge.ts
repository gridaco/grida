/**
 * Merges multiple objects, filtering out undefined properties from each object.
 *
 * This function takes multiple partial objects of the same type and merges them
 * into a single object. Only properties with defined values (not undefined) are
 * included in the result. Later objects in the arguments list will override
 * properties from earlier objects.
 *
 * @template T - The type of objects to merge
 * @param objects - An array of partial objects to merge. Can include undefined values which will be ignored.
 * @returns A partial object containing all defined properties from the input objects
 *
 * @example
 * ```typescript
 * const obj1 = { a: 1, b: undefined, c: 3 };
 * const obj2 = { a: 2, d: 4 };
 * const obj3 = undefined;
 *
 * const result = mergeDefinedProperties(obj1, obj2, obj3);
 * // Result: { a: 2, c: 3, d: 4 }
 * // Note: 'a' from obj2 overrides 'a' from obj1, 'b' is filtered out, 'c' is preserved
 * ```
 */
export function mergeDefinedProperties<T extends object>(
  ...objects: (Partial<T> | undefined)[]
): Partial<T> {
  return Object.assign(
    {},
    ...objects.map((obj) =>
      obj
        ? Object.fromEntries(
            Object.entries(obj).filter(([, v]) => v !== undefined)
          )
        : {}
    )
  );
}
