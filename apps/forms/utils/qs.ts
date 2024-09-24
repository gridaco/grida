/**
 * parsed query value
 */
export const qval = (v?: string | null) => {
  if (v) return v;
  else return null;
};

/**
 * Convert string to boolean (formdata, searchparams)
 */
export const qboolean = (v: string | null): boolean => {
  return v === "1" || v === "true" || v === "on";
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
