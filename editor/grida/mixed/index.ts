import deepEqual from "deep-equal";

type MixedProperties<T, S> = {
  [K in keyof T]: MixedProperty<T[K], S>;
};

type MixedPropertyType = "number" | "string" | "boolean" | "object";

type MixedProperty<T, S> = {
  type: MixedPropertyType;
  partial: boolean;
  ids: string[];
  // multiple unique values mapped
  values: {
    value: T;
    ids: string[];
  }[];
} & ({ value: T; mixed: false } | { value: S; mixed: true });

type KeyIgnoreFn<T> = (key: keyof T | string) => boolean;
type CompareFn<T = any> = (a: T, b: T) => boolean;
export type PropertyCompareFn<T> = <K extends keyof T>(
  key: K,
  a: T[K],
  b: T[K]
) => boolean;

type MixedOptions<T, S> = {
  idKey: keyof T;
  ignoredKey?: (keyof T)[] | KeyIgnoreFn<T>;
  compare?: PropertyCompareFn<T>;
  mixed: S;
};

function should_ignore_key<T>(
  key: keyof T | string,
  ignoredKeys: (keyof T)[] | KeyIgnoreFn<T>
) {
  return ignoredKeys instanceof Function
    ? ignoredKeys(key)
    : ignoredKeys.includes(key as keyof T);
}

/**
 * Analyzes an array of objects and produces a summary of their properties,
 * indicating whether the values are mixed, partial, or consistent across the objects.
 *
 * This function is particularly useful for managing multi-selection scenarios,
 * such as in a canvas editor, where properties of multiple selected items
 * need to be summarized and controlled dynamically.
 *
 * @template T - The type of objects being analyzed.
 *
 * @param {T[]} objects - The array of objects to analyze. Each object should include a unique identifier key specified by `options.idKey`.
 * @param {MixedOptions} options - Options to configure the behavior of the `mixed` function.
 * @param {string} options.idKey - The key in the objects that uniquely identifies them (e.g., `"id"`).
 * @param {string[]} [options.ignoredKeys=[]] - Optional list of keys to ignore during analysis. Default is an empty array.
 *
 * @returns {Record<string, MixedProperty>} - A record of property names to their mixed analysis results.
 * Each entry includes:
 * - `type`: The type of the property (`"number"`, `"string"`, or `"boolean"`).
 * - `value`: The consistent value of the property across all objects, or `null` if the value is mixed.
 * - `mixed`: A boolean indicating whether the property values differ across the objects.
 * - `partial`: A boolean indicating whether the property is missing in some objects.
 * - `ids`: An array of object IDs where the property is defined.
 *
 * @example
 * ```typescript
 * const objects = [
 *   { id: "a", x: 10, y: 20, color: "red" },
 *   { id: "b", x: 10, y: 30, color: "blue" },
 *   { id: "c", x: 10, color: "red" },
 * ];
 *
 * const result = mixed(objects, { idKey: "id", ignoredKeys: ["id", "type", "z"] });
 *
 * console.log(result);
 * // Output:
 * // {
 * //   x: { type: "number", value: 10, mixed: false, partial: false, ids: ["a", "b", "c"] },
 * //   y: { type: "number", value: null, mixed: true, partial: true, ids: ["a", "b"] },
 * //   color: { type: "string", value: null, mixed: true, partial: false, ids: ["a", "b", "c"] }
 * // }
 * ```
 */
export default function mixed<T extends Record<string, any>, S>(
  objects: T[],
  {
    idKey,
    ignoredKey: ignoredKeys = [],
    mixed: mixedIndicator,
    compare = deepEqual,
  }: MixedOptions<T, S>
): MixedProperties<T, S> {
  if (!objects.length) return {} as MixedProperties<T, S>;

  const allKeys = Array.from(
    new Set(objects.flatMap((obj) => Object.keys(obj)))
  ).filter((k) => k !== idKey && !should_ignore_key(k, ignoredKeys));

  const result: Record<string, MixedProperty<any, any>> = {};

  for (const key of allKeys) {
    const values = objects.map((obj) => obj[key]);
    const definedValues = values.filter((v) => v !== undefined);
    const uniqueValues = unique(definedValues, (a, b) => compare(key, a, b));

    const type = getMixedPropertyType(definedValues[0]);

    const isMixed = uniqueValues.length > 1;
    const mappedValues = uniqueValues.map((val) => ({
      value: val,
      ids: objects
        .filter((obj) => compare(key, obj[key], val))
        .map((obj) => obj[idKey]),
    }));

    result[key] = {
      type,
      value: isMixed ? mixedIndicator : uniqueValues[0],
      mixed: isMixed,
      partial: definedValues.length < objects.length,
      ids: objects
        .filter((obj) => obj[key] !== undefined)
        .map((obj) => obj[idKey]),
      values: mappedValues,
    };
  }

  return result as MixedProperties<T, S>;
}

function getMixedPropertyType(value: any): MixedPropertyType {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value && typeof value === "object" && !Array.isArray(value))
    return "object";
  return undefined as any;
}

function unique<T>(arr: T[], eq: CompareFn<T>): T[] {
  const result: T[] = [];
  for (const item of arr) {
    if (!result.some((r) => eq(r, item))) {
      result.push(item);
    }
  }
  return result;
}
