///
/// Grid data manipulation for XSB dynamic postgrest json schema (unknown by grida schema)
///
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { GridaXSupabase } from "@/types";
import { priority_sorter } from "@/utils/sort";
import type { JSONType } from "ajv";

export namespace GridDataXSBUnknown {
  /**
   * General & common priorities for column order
   */
  export const unknown_table_column_priorities = [
    "id",
    "email",
    "name",
    "username",
    "display_name",
    "title",
    "slug",
    "status",
    "role",
    "type",
    "category",
    "tags",
    "description",
    // created time
    "created_at",
    "phone",
    "address",
    "city",
    "state",
    "country",
    "postal_code",
    "url",
    "birth_date",
    "gender",
    "age",
    "company",
    "position",
    "department",
    "location",
    // other time related
    "updated_at",
    "deleted_at",
    "created_by",
    "updated_by",
    "deleted_by",
  ];

  export type DataGridColumn = {
    key: string;
    name: string;
    type?: JSONType;
    format?: SupabasePostgRESTOpenApi.PostgRESTOpenAPIDefinitionPropertyFormatType;
    pk: boolean;
  };

  export type DataGridRow = GridaXSupabase.XDataRow;

  export const sort_unknow_table_properties_by_priorities = priority_sorter(
    unknown_table_column_priorities
  );

  type ColumnsSortFn = (
    a: SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionProperty & {
      key: string;
    },
    b: SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionProperty & {
      key: string;
    }
  ) => number;

  export function columns(
    schema:
      | SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema
      | undefined
      | null,
    options?: {
      sort?: ColumnsSortFn | "unknown_table_column_priorities";
    }
  ): DataGridColumn[] {
    const keys = Object.keys(schema?.properties ?? {});

    if (options?.sort) {
      if (typeof options.sort === "function") {
        keys.sort((a, b) => {
          return (options.sort as ColumnsSortFn)(
            { ...schema!.properties[a], key: a },
            { ...schema!.properties[b], key: b }
          );
        });
      } else {
        switch (options.sort) {
          case "unknown_table_column_priorities":
            keys.sort((a, b) => {
              return sort_unknow_table_properties_by_priorities(a, b);
            });
        }
      }
    }

    return keys.map((key) => {
      const property = schema?.properties?.[key];
      if (property) {
        const meta = SupabasePostgRESTOpenApi.parse_postgrest_property_meta(
          key,
          schema?.properties?.[key] ?? {},
          schema?.required
        );
        return {
          key: key,
          name: key,
          type: meta.type,
          format: meta.format,
          pk: meta.pk,
        } satisfies DataGridColumn;
      } else {
        return {
          key: key,
          name: key,
          type: undefined,
          format: undefined,
          pk: false,
        } satisfies DataGridColumn;
      }
    });
  }
}
