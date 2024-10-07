import type { JSONSchemaType, JSONType } from "ajv";
import type { OpenAPI } from "openapi-types";
import type { GridaXSupabase } from "@/types";
import { XMLParser } from "fast-xml-parser";
import type { PGSupportedColumnType } from "../pg-meta/@types/pg";
import assert from "assert";
import type { Data } from "../data";

export namespace SupabasePostgRESTOpenApi {
  /**
   * @example
   *
   * ```
   * {
   *   "format": "bigint",
   *   "format": "custom_schema.custom_type",
   * }
   * ```
   */
  export type PostgRESTOpenAPIDefinitionPropertyFormatType =
    | PGSupportedColumnType
    | `${PGSupportedColumnType}[]`
    | string;

  /**
   * @example
   *
   * ```
   * {
   *   "description": "Note:\nThis is a Foreign Key to `t1.id`.<fk table='t1' column='id'/>",
   *   "format": "bigint",
   *   "type": "integer"
   * }
   * ```
   */
  export type SupabaseOpenAPIDefinitionProperty = {
    default?: string;
    /**
     * description provided by system (and user)
     * when the column is a pk or a fk, it comes with a message formated as:
     *
     * @example
     * - "ID\n\nNote:\nThis is a Primary Key.<pk/>"
     * - "Note:\nThis is a Foreign Key to `organization.id`.<fk table='organization' column='id'/>"
     */
    description?: string;
    format: PostgRESTOpenAPIDefinitionPropertyFormatType;
    type:
      | "string"
      | "number"
      | "integer"
      | "boolean"
      | "null"
      | "array"
      | undefined;
    enum?: string[];
    items: JSONSchemaType<any>;
  };

  /**
   * A.k.a Table Schema
   */
  export type SupabaseOpenAPIDefinitionJSONSchema = JSONSchemaType<
    Record<string, any>
  > & {
    properties: {
      [key: string]: SupabaseOpenAPIDefinitionProperty;
    };
    type: JSONType;
    required: string[] | null;
  };

  export type SupabaseOpenAPIDocument = OpenAPI.Document & {
    basePath: string;
    consumes: string[];
    definitions: {
      [key: string]: SupabaseOpenAPIDefinitionJSONSchema;
    };
    host: string;
    parameters: any;
    produces: string[];
    schemes: string[];
    swagger: string;
  };

  export type SupabasePublicSchema = SupabaseOpenAPIDocument["definitions"];

  export function build_supabase_rest_url(url: string) {
    return `${url}/rest/v1/`;
  }

  export function build_supabase_openapi_url(url: string, apiKey: string) {
    return `${url}/rest/v1/?apikey=${apiKey}`;
  }

  export async function fetch_supabase_postgrest_openapi_doc({
    url,
    anonKey,
    schemas = ["public"],
  }: {
    url: string;
    anonKey: string;
    schemas?: string[];
  }): Promise<{
    sb_anon_key: string;
    sb_project_reference_id: string;
    sb_schema_names: string[];
    sb_schema_openapi_docs: { [schema: string]: SupabaseOpenAPIDocument };
    sb_schema_definitions: { [schema: string]: { [key: string]: any } };
    sb_project_url: string;
  }> {
    return new Promise(async (resolve, reject) => {
      try {
        const u = new URL(url);
        const projectref = u.hostname.split(".")[0];
        const route = build_supabase_openapi_url(url, anonKey);

        const schema_definitions: { [schema: string]: any } = {};
        const schema_apidocs: { [schema: string]: any } = {};

        // can be optimized
        for (const schema of schemas) {
          const apidoc = await fetch_swagger(route, schema);
          // validate
          if (!apidoc || !("definitions" in apidoc)) {
            return reject();
          }
          schema_apidocs[schema] = apidoc;
          schema_definitions[schema] = apidoc.definitions;
        }

        return resolve({
          sb_anon_key: anonKey,
          sb_project_reference_id: projectref,
          sb_schema_openapi_docs: schema_apidocs,
          sb_schema_definitions: schema_definitions,
          sb_schema_names: schemas,
          sb_project_url: url,
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function fetch_swagger(url: string, schema = "public") {
    const res = await fetch(url, {
      headers: {
        // https://postgrest.org/en/stable/references/api/schemas.html
        "Accept-Profile": schema,
      },
    });
    const apidoc: SupabaseOpenAPIDocument = await res.json();
    if (!res.ok || !apidoc) {
      return undefined;
    }

    return apidoc;
  }

  type PostgrestPathMethod = "get" | "post" | "delete" | "patch";
  /**
   *
   * the open api doc contains paths as `"/[table]": { ... }`
   * with this, we can tell if postgrest table is readonly or writable.
   *
   * ```js
   * "paths": {
   *  ...
   *  "/table": {
   *    "get": {...},
   *    "post": {...},
   *    "delete": {...},
   *    "patch": {...}
   *  },
   *  ...
   * }
   *
   * ```
   * @param doc
   * @param table
   */
  export function parse_supabase_postgrest_table_path(
    doc: SupabaseOpenAPIDocument,
    table: string
  ): { methods: PostgrestPathMethod[] } {
    const paths = doc.paths?.["/" + table];
    if (!paths) return { methods: [] };

    const methodkeys = Object.keys(paths);

    for (const key of methodkeys) {
      assert(["get", "post", "delete", "patch"].includes(key));
    }

    return {
      methods: Array.from(new Set(methodkeys)) as PostgrestPathMethod[],
    };
  }

  export function table_is_get_only(
    apidoc: SupabaseOpenAPIDocument,
    table: string
  ) {
    const { methods } = parse_supabase_postgrest_table_path(apidoc, table);
    return table_methods_is_get_only(methods);
  }

  export function table_methods_is_get_only(methods: PostgrestPathMethod[]) {
    return methods.length === 1 && methods[0] === "get";
  }

  /**
   * PostgREST Column Relationship
   *
   * postgrest does not emmit metadata on description for composite foreign keys
   * only one column per foreign key is supported
   */
  export type PostgRESTColumnRelationship =
    Data.Relation.NonCompositeRelationship;

  export type PostgRESTColumnMeta = Data.Relation.Attribute;

  export function parse_postgrest_property_meta(
    key: string,
    property: SupabaseOpenAPIDefinitionProperty,
    required: string[] | null
  ): PostgRESTColumnMeta {
    const { type, format, description, default: defaultValue } = property;

    const is_array = property.format.includes("[]");
    const scalar = is_array
      ? (property.format.replace("[]", "") as PGSupportedColumnType)
      : (property.format as PGSupportedColumnType);

    let pk: boolean = false;
    let fk: PostgRESTColumnRelationship | null = null;

    if (description) {
      const { fk: _fk, pk: _pk } =
        parse_supabase_postgrest_property_description(key, description);
      pk = _pk;
      fk = _fk;
    }

    const _required = required?.includes(key) || false;
    return {
      name: key,
      type,
      format,
      scalar_format: scalar,
      array: is_array,
      enum: property.enum,
      description,
      pk,
      fk: fk || false,
      default: defaultValue,
      null: !_required,
    } satisfies PostgRESTColumnMeta;
  }

  export function parse_supabase_postgrest_schema_definition(
    schema: GridaXSupabase.JSONSChema
  ): Omit<Data.Relation.TableDefinition, "name"> {
    const parsed: {
      pks: string[];
      fks: PostgRESTColumnRelationship[];
      properties: { [key: string]: PostgRESTColumnMeta };
    } = {
      pks: [],
      fks: [],
      properties: {},
    };

    Object.entries(schema.properties)
      .map(([columnName, columnDetails]) => {
        return {
          ...parse_postgrest_property_meta(
            columnName,
            columnDetails,
            schema.required
          ),
        };
      })
      .reduce((acc, columnMeta) => {
        acc.properties[columnMeta.name] = columnMeta;
        if (columnMeta.pk) acc.pks.push(columnMeta.name);
        if (columnMeta.fk) acc.fks.push(columnMeta.fk);
        return acc;
      }, parsed);

    return parsed;
  }

  /**
   * Parses the schema from a Supabase Postgrest endpoint to extract primary keys and foreign keys.
   *
   * @param schema - The JSON schema object to parse.
   * @returns An object containing arrays of primary keys and foreign keys.
   *
   * @example
   * const schema: SupabaseOpenAPIDefinitionJSONSchema = {
   *   properties: {
   *     id: {
   *       description: "Note:\nThis is a Primary Key.<pk/>",
   *       format: "bigint",
   *       type: "integer"
   *     },
   *     created_at: {
   *       default: "now()",
   *       format: "timestamp with time zone",
   *       type: "string"
   *     },
   *     organization_id: {
   *       description: "Note:\nThis is a Foreign Key to `organization.id`.<fk table='organization' column='id'/>",
   *       format: "bigint",
   *       type: "integer"
   *     },
   *     user_id: {
   *       default: "auth.uid()",
   *       format: "uuid",
   *       type: "string"
   *     }
   *   },
   *   required: ["id", "created_at", "organization_id", "user_id"],
   *   type: "object"
   * };
   *
   * const result = parse_supabase_postgrest_schema_properties_description(schema);
   * console.log(result);
   * // Output:
   * // {
   * //   primaryKeys: ["id"],
   * //   foreignKeys: [
   * //     {
   * //       referencing_column: "organization_id",
   * //       referenced_table: "organization",
   * //       referenced_column: "id"
   * //     }
   * //   ]
   * // }
   */
  function parse_supabase_postgrest_schema_properties_description(
    schema: SupabaseOpenAPIDefinitionJSONSchema
  ) {
    const result = {
      pks: [] as string[],
      fks: [] as PostgRESTColumnRelationship[],
    };

    // schema.properties
    for (const [columnName, columnDetails] of Object.entries(
      schema.properties
    )) {
      if (columnDetails.description) {
        const { pk, fk } = parse_supabase_postgrest_property_description(
          columnName,
          columnDetails.description
        );
        const description = columnDetails.description;

        if (pk) {
          result.pks.push(columnName);
        }

        if (fk) {
          result.fks.push(fk);
        }
      }
    }

    return result;
  }

  /**
   * Parses the description of a property from a Supabase Postgrest schema to determine
   * if it contains information about primary keys or foreign keys.
   *
   * @param key - The name of the property being described.
   * @param description - The description string that may contain metadata about primary or foreign keys.
   * @returns An object containing two properties:
   * - `pk`: A boolean indicating whether the property is a primary key.
   * - `fk`: An object representing the foreign key relationship if present, or `null` if not present.
   *
   * @example
   * const description = "Note:\nThis is a Foreign Key to `organization.id`.<fk table='organization' column='id'/>";
   * const result = parse_supabase_postgrest_property_description("organization_id", description);
   * console.log(result);
   * // Output:
   * // {
   * //   pk: false,
   * //   fk: {
   * //     referencing_column: "organization_id",
   * //     referenced_table: "organization",
   * //     referenced_column: "id"
   * //   }
   * // }
   *
   * @example
   * const description = "Note:\nThis is a Primary Key.<pk/>";
   * const result = parse_supabase_postgrest_property_description("id", description);
   * console.log(result);
   * // Output:
   * // {
   * //   pk: true,
   * //   fk: null
   * // }
   */
  export function parse_supabase_postgrest_property_description(
    key: string,
    description: string
  ): {
    pk: boolean;
    fk: PostgRESTColumnRelationship | null;
  } {
    const res: { pk: boolean; fk: PostgRESTColumnRelationship | null } = {
      pk: false,
      fk: null,
    };

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
    });

    // Parse description with fast-xml-parser
    const parsedDescription = parser.parse(description);

    // Check for Primary Key
    if (parsedDescription.pk !== undefined) {
      res.pk = true;
    }

    // Check for Foreign Key
    if (parsedDescription.fk) {
      const table: string = parsedDescription.fk["table"];
      const column: string = parsedDescription.fk["column"];
      if (table && column) {
        res.fk = {
          referencing_column: key,
          referenced_table: table,
          referenced_column: column,
        };
      }
    }

    return res;
  }

  export function parse_pks(schema: SupabaseOpenAPIDefinitionJSONSchema) {
    const parsed =
      SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
        schema
      );

    return {
      pk_col: (parsed?.pks?.length || 0) === 1 ? parsed?.pks[0] : undefined,
      pk_cols: parsed?.pks || [],
      pk_first_col: (parsed?.pks?.length || 0) > 0 ? parsed?.pks[0] : undefined,
    };
  }
}
