import {
  flatten as _flatten,
  unflatten as _unflatten,
  FlattenOptions,
} from "flat";
/**
 * Namespace FlatPostgREST
 *
 * This namespace provides utilities for encoding and decoding JSON paths in a format suitable
 * for working with PostgREST, a RESTful API for PostgreSQL databases. The chosen format
 * `field.$.a.b` explicitly differentiates between normal columns and JSON properties, making
 * it easier to parse and construct nested JSON structures from form data.
 *
 * The `FlatPostgREST` namespace includes functions to:
 *  - Encode a JSON path into a dot-separated string with a `$` indicator for nested properties.
 *  - Decode a string with the `$` indicator back into a key and path array.
 *  - Parse form data, transforming it into a structured object based on the encoded JSON paths.
 *
 * Examples:
 *
 * ```typescript
 * // Encoding a JSON path
 * const encodedPath = FlatPostgREST.encodePath('data', 'a.b');
 * console.log(encodedPath);  // Outputs: "data.$.a.b"
 *
 * // Decoding a JSON path
 * const decodedPath = FlatPostgREST.decodePath('data.$.a.b');
 * console.log(decodedPath);  // Outputs: "a.b"
 *
 * // Parsing form data
 * const formdata = new FormData();
 * formdata.append('data.$.a.b', 'value');
 * const schema = {
 *   type: "object",
 *   properties: {
 *     data: {
 *       type: "object",
 *       format: "json",
 *       properties: {
 *         a: {
 *           type: "object",
 *           properties: {
 *             b: { type: "string" }
 *           }
 *         }
 *       }
 *     }
 *   }
 * };
 * const enums = []; // Assuming FormValue and enums are defined appropriately
 * const parsedData = FlatPostgREST.unflatten(formdata, { enums });
 * console.log(parsedData);  // Outputs: { a: { b: "value" } }
 * ```
 */
export namespace FlatPostgREST {
  //

  /**
   * Regular expression to match JSON path formats like field.$.patha.pathb.pathc
   */
  export const POSTGREST_JSON_PATH_REGEX = /^([^.]+)\.\$\.[^.]+(?:\.[^.]+)*$/;

  export function testPath(fullpath: string): boolean {
    return POSTGREST_JSON_PATH_REGEX.test(fullpath);
  }

  export function decodePath(fullpath: string): {
    column: string;
    path: string;
  } {
    const match = POSTGREST_JSON_PATH_REGEX.exec(fullpath);
    if (match) {
      // Remove the initial field and '.$' part
      const extractedPath = fullpath.replace(/^([^.]+)\.\$\./, "");
      return { column: match[1], path: extractedPath };
    } else {
      throw new Error(`Invalid JSON path: ${fullpath}`);
    }
  }

  export function encodePath(column: string, ...path: string[]): string {
    return `${column}.\$.${path.join(".")}`;
  }

  export function unflatten(
    data: Record<string, any>,
    options?: FlattenOptions,
    {
      value: valuefn,
      key: keyfilterfn,
    }: {
      key?: (key: string) => boolean;
      value?: (key: string, value?: any) => any;
    } = {}
  ): any {
    const keys = Object.keys(data);

    const jsonpath_data = keys.reduce(
      (acc, _key) => {
        const key = keyfilterfn ? (keyfilterfn(_key) ? _key : undefined) : _key;
        if (key && testPath(key)) {
          const { path } = decodePath(key);
          const value = valuefn ? valuefn(key, data[key]) : data[key];
          acc[path] = value;
        }
        return acc;
      },
      {} as Record<string, any>
    );

    return _unflatten(jsonpath_data, options);
  }

  export function get<T = any>(
    fullpath: string,
    row: Record<string, T>
  ): T | undefined {
    const { column, path: jsonpath } = decodePath(fullpath);

    const json = row[column];

    if (json) {
      const flat = _flatten(json) as Record<string, T>;
      return flat[jsonpath];
    }

    return undefined;
  }

  export function update<T = any>(
    row: Record<string, Record<string, T>>,
    fullpath: string,
    value: T
  ) {
    const data = Object.assign({}, row);

    const { column, path: jsonpath } = decodePath(fullpath);

    if (!data[column]) {
      data[column] = {};
    }

    const json = data[column] as Record<string, T>;
    const flat = _flatten(json) as Record<string, T>;
    flat[jsonpath] = value;

    data[column] = _unflatten(flat);

    return data;
  }
}
