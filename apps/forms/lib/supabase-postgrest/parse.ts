import type { JSONSchemaType, JSONType } from "ajv";
import type { OpenAPI } from "openapi-types";
import type { GridaXSupabase } from "@/types";
import type { ColumnType } from "./@types/column-types";
import { XMLParser } from "fast-xml-parser";
import type {
  PGSupportedColumnType,
  PGSupportedColumnTypeWithoutArray,
} from "./@types/pg";
import assert from "assert";
export namespace SupabasePostgRESTOpenApi {
  export type SupabaseOpenAPIDefinitionJSONSchema = JSONSchemaType<
    Record<string, any>
  > & {
    properties: {
      [key: string]: {
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
        format: PGSupportedColumnType | `${PGSupportedColumnType}[]`;
        type?: JSONType;
        enum?: string[];
        items: JSONSchemaType<any>;
      };
    };
    type: JSONType;
    required: string[];
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
  export type PostgRESTColumnRelationship = {
    referencing_column: string;
    referenced_table: string;
    referenced_column: string;
    //
    // column: string;
    // table: string;
    // foreignColumn: string;
  };

  export type PostgRESTColumnMeta = {
    name: string;
    type?: JSONType;
    format?: PGSupportedColumnType | `${PGSupportedColumnType}[]` | string;
    pk: boolean;
    fk: PostgRESTColumnRelationship | null;
    description?: string;
    required: boolean;
    default?: string;
  };

  export function parse_supabase_postgrest_schema_definition(
    schema: GridaXSupabase.JSONSChema
  ) {
    const parsed: {
      pks: string[];
      fks: PostgRESTColumnRelationship[];
      properties: { [key: string]: PostgRESTColumnMeta };
    } = {
      pks: [],
      fks: [],
      properties: {},
    };

    // for (const table in definitions) {
    const { pks, fks } =
      parse_supabase_postgrest_schema_properties_description(schema);

    Object.entries(schema.properties)
      .map(([columnName, columnDetails]) => {
        const {
          type,
          format,
          description,
          default: defaultValue,
        } = columnDetails;
        const pk = pks.includes(columnName);
        const fk =
          fks.find((fk) => fk.referencing_column === columnName) || null;

        return {
          name: columnName,
          type,
          // https://github.com/supabase/postgrest-js/issues/544
          // need a better way for parsing format
          format,
          description,
          // required can be null when postgrest view
          required: schema.required?.includes(columnName),
          pk,
          fk,
          default: defaultValue,
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

  type Format =
    | ColumnType
    | `${ColumnType}[]`
    // else
    | (string & {});

  export function analyze_format(property: {
    type: string;
    format: Format;
    enum?: string[];
  }): {
    is_enum: boolean;
    is_array: boolean;
    format: ColumnType;
    type: PGSupportedColumnTypeWithoutArray;
  } {
    const is_array = property.format.includes("[]");
    const scalar = is_array
      ? (property.format.replace("[]", "") as ColumnType)
      : (property.format as ColumnType);

    // switch (scalar) {
    //   case ''
    // }

    const is_enum = !!property.enum;

    return {
      is_enum,
      is_array,
      format: scalar,
      type: property.type as PGSupportedColumnTypeWithoutArray,
    };
  }
}
