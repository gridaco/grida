import deepEqual from "deep-equal";

type MixedProperties<T, S> = {
  [K in keyof T]: MixedProperty<T[K], S>;
};

type MixedPropertyType = "number" | "string" | "boolean" | "object";

type MixedProperty<T, S> = {
  type: MixedPropertyType;
  partial: boolean;
  ids: string[];
  // /**
  //  * values mapped by unique values
  //  * when mixed is false, this will have only one entry
  //  */
  // values: {
  //   value: T;
  //   ids: string[];
  // }[];
} & (
  | {
      value: T;
      mixed: false;
    }
  | { value: S; mixed: true }
);

type KeyIgnoreFn<T> = (key: keyof T | string) => boolean;

type MixedOptions<T, S> = {
  idKey: keyof T;
  ignoredKey?: (keyof T)[] | KeyIgnoreFn<T>;
  mixed: S;
};

const should_ignore_key = <T>(
  key: keyof T | (string | {}),
  { ignoredKeys }: { ignoredKeys: (keyof T)[] | KeyIgnoreFn<T> }
) => {
  if (ignoredKeys instanceof Function) {
    return ignoredKeys(key as keyof T);
  }
  return ignoredKeys.includes(key as keyof T);
};

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
  options: MixedOptions<T, S>
): MixedProperties<T, S> {
  const { idKey, ignoredKey: ignoredKeys = [] } = options;

  const result: Record<string, MixedProperty<T, S>> = {};

  if (objects.length === 0) {
    return result as MixedProperties<T, S>;
  }

  // Get all unique keys from objects (excluding ignored keys).
  const allKeys = Array.from(
    new Set(objects.flatMap((obj) => Object.keys(obj)))
  ).filter((key) => key !== idKey && !should_ignore_key(key, { ignoredKeys }));

  // Analyze each key.
  for (const key of allKeys) {
    const values = objects.map((obj) => obj[key]);
    const definedValues = values.filter((value) => value !== undefined);
    const uniqueValues = unique(definedValues);

    let type: MixedPropertyType | undefined;
    switch (typeof definedValues[0]) {
      case "string":
        type = "string";
        break;
      case "number":
        type = "number";
        break;
      case "boolean":
        type = "boolean";
        break;
      case "object":
        if (Array.isArray(definedValues[0])) {
          type = undefined;
          break;
        }
        type = "object";
        break;

      default:
        // Default to undefined instead of null
        type = undefined;
        break;
    }

    const mixed = uniqueValues.length > 1;

    result[key] = {
      type: type as MixedProperty<T, S>["type"],
      value: mixed ? options.mixed : uniqueValues[0],
      mixed: mixed,
      partial: definedValues.length < objects.length,
      ids: objects
        .filter((obj) => obj[key] !== undefined)
        .map((obj) => obj[idKey]),
    };
  }

  return result as MixedProperties<T, S>;
}

/**
 *
 * @param array of items
 * @returns array of unique items
 */
function unique<T>(arr: T[], eq = deepEqual): T[] {
  const result: T[] = [];
  for (const item of arr) {
    if (!result.some((r) => eq(r, item))) {
      result.push(item);
    }
  }
  return result;
}
