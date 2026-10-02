import type { JSONSchemaType, JSONType } from "ajv";
import type { GridaXSupabase } from "../../types";
import { XMLParser } from "fast-xml-parser";
type PGSupportedColumnType = string;
import type { Relation } from "../../types";

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
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- JSONSchemaType from ajv requires any
    items: JSONSchemaType<any>;
  };

  /**
   * A.k.a Table Schema
   */
  export type SupabaseOpenAPIDefinitionJSONSchema = JSONSchemaType<
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- JSONSchemaType from ajv requires any
    Record<string, any>
  > & {
    properties: {
      [key: string]: SupabaseOpenAPIDefinitionProperty;
    };
    type: JSONType;
    required: string[] | null;
  };

  /**
   * PostgREST Column Relationship
   *
   * postgrest does not emmit metadata on description for composite foreign keys
   * only one column per foreign key is supported
   */
  export type PostgRESTColumnRelationship = Relation.NonCompositeRelationship;

  export type PostgRESTColumnMeta = Relation.Attribute;

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
      //
      // Note: in postgREST, required means `not null`, but only valid for a table (not a view)
      // when view, required[] is always undefined
      // @see https://github.com/PostgREST/postgrest/issues/3745
      //
      null: !_required,
    } satisfies PostgRESTColumnMeta;
  }

  export function parse_supabase_postgrest_schema_definition(
    schema: GridaXSupabase.JSONSChema
  ): Omit<Relation.TableDefinition, "name"> {
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
