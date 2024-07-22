import type { OpenAPI } from "openapi-types";
import type { GridaSupabase } from "@/types";
import type { ColumnType } from "./@types/column-types";
import { XMLParser } from "fast-xml-parser";

export namespace SupabasePostgRESTOpenApi {
  export type SupabaseOpenAPIDocument = OpenAPI.Document & {
    basePath: string;
    consumes: string[];
    definitions: {
      [key: string]: {
        properties: {
          [key: string]: {
            default?: any;
            description?: string;
            type: string;
            format: string;
          };
        };
        type: string;
        required: string[];
      };
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

  export async function fetch_supabase_postgrest_swagger({
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
    sb_schema_definitions: { [schema: string]: { [key: string]: any } };
    sb_project_url: string;
  }> {
    return new Promise(async (resolve, reject) => {
      try {
        const u = new URL(url);
        const projectref = u.hostname.split(".")[0];
        const route = build_supabase_openapi_url(url, anonKey);

        const schema_definitions: { [schema: string]: any } = {};

        // can be optimized
        for (const schema of schemas) {
          const apidoc = await fetch_swagger(route, schema);
          // validate
          if (!apidoc || !("definitions" in apidoc)) {
            return reject();
          }
          schema_definitions[schema] = apidoc.definitions;
        }

        return resolve({
          sb_anon_key: anonKey,
          sb_project_reference_id: projectref,
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

  export type FKMeta = {
    column: string;
    table: string;
    foreignColumn: string;
  };

  export type PostgRESTColumnMeta = {
    name: string;
    type: string;
    format: string;
    pk: boolean;
    fk: FKMeta | null;
    description?: string;
    required: boolean;
    default: string;
  };

  export function parse_supabase_postgrest_schema_definition(
    schema: GridaSupabase.JSONSChema
  ) {
    const parsed: {
      pks: string[];
      fks: FKMeta[];
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
        const fk = fks.find((fk) => fk.column === columnName) || null;

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
   * const schema: GridaSupabase.JSONSChema = {
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
   * //       column: "organization_id",
   * //       table: "organization",
   * //       foreignColumn: "id"
   * //     }
   * //   ]
   * // }
   */
  function parse_supabase_postgrest_schema_properties_description(
    schema: GridaSupabase.JSONSChema
  ) {
    const result = {
      pks: [] as string[],
      fks: [] as FKMeta[],
    };

    const options = {
      ignoreAttributes: false,
      attributeNamePrefix: "",
    };

    const parser = new XMLParser(options);

    for (const [columnName, columnDetails] of Object.entries(
      schema.properties
    )) {
      if (columnDetails.description) {
        const description = columnDetails.description;

        // Parse description with fast-xml-parser
        const parsedDescription = parser.parse(description);

        // Check for Primary Key
        if (parsedDescription.pk !== undefined) {
          result.pks.push(columnName);
        }

        // Check for Foreign Key
        if (parsedDescription.fk) {
          const table = parsedDescription.fk["@_table"];
          const column = parsedDescription.fk["@_column"];
          if (table && column) {
            result.fks.push({
              column: columnName,
              table: table,
              foreignColumn: column,
            });
          }
        }
      }
    }

    return result;
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
    type: string;
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
      type: property.type,
    };
  }
}
