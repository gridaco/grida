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

  export function testPath(path: string): boolean {
    return POSTGREST_JSON_PATH_REGEX.test(path);
  }

  export function decodePath(path: string): { column: string; path: string } {
    const match = POSTGREST_JSON_PATH_REGEX.exec(path);
    if (match) {
      // Remove the initial field and '.$' part
      const extractedPath = path.replace(/^([^.]+)\.\$\./, "");
      return { column: match[1], path: extractedPath };
    } else {
      throw new Error(`Invalid JSON path: ${path}`);
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

  export function get(path: string, row: Record<string, any>): any {
    const { column, path: jsonpath } = decodePath(path);

    const json = row[column];

    if (json) {
      const flat = _flatten(json) as Record<string, any>;
      return flat[jsonpath];
    }

    return undefined;
  }
}
