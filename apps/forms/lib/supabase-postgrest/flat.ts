import { flatten, unflatten, FlattenOptions } from "flat";
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
 * const encodedPath = FlatPostgREST.encodePath('data', ['a', 'b']);
 * console.log(encodedPath);  // Outputs: "data.$.a.b"
 *
 * // Decoding a JSON path
 * const decodedPath = FlatPostgREST.decodePath('data.$.a.b');
 * console.log(decodedPath);  // Outputs: { key: "data", path: ["a", "b"] }
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
 * const parsedData = FlatPostgREST.parseFormData(formdata, { schema, enums });
 * console.log(parsedData);  // Outputs: { data: { a: { b: "value" } } }
 * ```
 */
export namespace FlatPostgREST {
  //
}
