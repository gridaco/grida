/**
 * parsed query value
 */
export const qval = (v?: string | null) => {
  if (v) return v;
  else return null;
};

/**
 * Convert string to boolean (formdata, searchparams)
 *
 * `true`:
 * - `"1"`
 * - `"true"`
 * - `"on"`
 * - `"yes"`
 * - `"y"`
 *
 * `false`:
 * - all other values
 */
export const qboolean = (v: string | null): boolean => {
  return v === "1" || v === "true" || v === "on" || v === "yes" || v === "y";
};

export function queryorbody(
  key: string,
  b: {
    searchParams: URLSearchParams;
    body: any;
  }
) {
  return b.searchParams.get(key) || b.body?.[key];
}

/**
 * Removes specified keys from the given URLSearchParams object.
 *
 * @param {URLSearchParams} search - The URLSearchParams object to modify.
 * @param {...string} omit - The list of keys to be removed from the URLSearchParams.
 * @returns {URLSearchParams} - The modified URLSearchParams object with the specified keys omitted.
 *
 * @example
 * const params = new URLSearchParams('foo=1&bar=2&baz=3');
 * omit(params, 'foo', 'baz'); // Result: 'bar=2'
 */
export function omit(search: URLSearchParams, ...omit: string[]) {
  // delete the keys
  for (const key of omit) {
    search.delete(key);
  }
  return search;
}

/**
 * Safely converts a given object of key-value pairs into URL search parameters.
 * It filters out `null` and `undefined` values and ensures all others are
 * converted to strings before being added to the URL parameters.
 *
 * @param params - An object where the keys are strings and the values can be
 * of type string, number, boolean, null, or undefined.
 *
 * @returns A `URLSearchParams` object containing only the valid key-value pairs.
 *
 * @example
 * ```ts
 * const params = { name: 'John', age: 30, active: true, token: null };
 * const searchParams = safeSearchParams(params);
 * console.log(searchParams.toString()); // "name=John&age=30&active=true"
 * ```
 */
export function safeSearchParams(
  params: Record<string, string | number | boolean | null | undefined>
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.set(key, value.toString());
    }
  }
  return search;
}
