export type HeaderAccept = "application/json" | "text/html";

/**
 * parse accept header to determine to response with json or redirect
 *
 * default fallback is json
 *
 * supports:
 * - application/json
 * - text/html
 */
export function haccept(
  accept?: string | null,
  fallback: "application/json" | "text/html" = "application/json"
): "application/json" | "text/html" {
  if (accept) {
    if (accept.includes("application/json")) return "application/json";
    if (accept.includes("text/html")) return "text/html";
  }
  return fallback;
}

export type HeaderContentType = "application/json" | "multipart/form-data";

/**
 *
 * parse content type header to determine to response with json or form data
 *
 * default fallback is json
 *
 * supports:
 * - application/json
 * - multipart/form-data
 */
export function hcontenttype(
  contenttype: string | null,
  fallback: HeaderContentType = "application/json"
) {
  if (contenttype) {
    if (contenttype.includes("application/json")) return "application/json";
    if (contenttype.includes("multipart/form-data"))
      return "multipart/form-data";
  }
  return fallback;
}

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
    body: Record<string, unknown>;
  }
): string | undefined {
  return (b.searchParams.get(key) || (b.body?.[key] as string)) ?? undefined;
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
