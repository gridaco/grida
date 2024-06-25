import type {
  FormFieldDefinition,
  FormInputType,
  FormResponse,
  FormResponseField,
  FormResponseSession,
} from "@/types";
import { fmt_local_index } from "@/utils/fmt";
import type { GFResponseRow, GFSystemColumnTypes } from "../grid/types";
import type { DataGridFilterSettings } from "../editor/state";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";

export namespace GridData {
  type DataGridInput = {
    fields: FormFieldDefinition[];
    filter: DataGridFilterSettings;
  } & (
    | {
        table: "session";
        sessions: FormResponseSession[];
      }
    | {
        table: "response";
        responses: {
          rows: FormResponse[];
          fields: { [key: string]: FormResponseField[] };
        };
      }
    | {
        table: "x-supabase-main-table";
        data: {
          pks: string[];
          rows: any[];
          fields: { [key: string]: any[] };
        };
      }
  );

  export function columns(
    table: "response" | "session" | "x-supabase-main-table",
    fields: FormFieldDefinition[]
  ): {
    systemcolumns: {
      key: GFSystemColumnTypes;
      name?: string;
    }[];
    columns: {
      key: string;
      name: string;
      type?: FormInputType;
    }[];
  } {
    const fieldcolumns =
      fields?.map((field) => ({
        key: field.id,
        name: field.name,
        type: field.type,
        // You can add more properties here as needed by react-data-grid
      })) ?? [];

    switch (table) {
      case "response":
      case "session": {
        return {
          systemcolumns: [
            {
              key: "__gf_display_id",
            },
            {
              key: "__gf_created_at",
            },
            {
              key: "__gf_customer_id",
            },
          ],
          columns: fieldcolumns,
        };
      }
      case "x-supabase-main-table": {
        return {
          systemcolumns: [
            {
              key: "__gf_display_id",
              // TODO:
              // 1. pass the name of pk
              // 2. allow multiple PKs
            },
          ],
          columns: fieldcolumns,
        };
      }
    }
  }

  export function rows(input: DataGridInput) {
    switch (input.table) {
      case "response": {
        return input.responses
          ? rows_from_responses(
              input.responses,
              // TODO:
              // applyFilter(data.responses, data.filter),

              input.fields
            )
          : [];
      }
      case "session": {
        return input.sessions
          ? rows_from_sessions(
              applyFilter(input.sessions, input.filter),
              input.fields
            )
          : [];
      }
      case "x-supabase-main-table": {
        const valuefn = (row: any, fieldname: string) => {
          if (FlatPostgREST.testPath(fieldname)) {
            return FlatPostgREST.get(fieldname, row);
          }
          return row[fieldname];
        };

        return input.data.rows.reduce((acc, row, index) => {
          // TODO: support multiple PKs
          const pk = input.data.pks.length > 0 ? input.data.pks[0] : null;
          const gfRow: GFResponseRow = {
            __gf_id: pk ? row[pk] : "",
            __gf_display_id: pk ? row[pk] : "",
            fields: {},
          };
          input.fields.forEach((field) => {
            gfRow.fields[field.id] = {
              type: field.type,
              value: valuefn(row, field.name),
            };
          });
          acc.push(gfRow);
          return acc;
        }, []);
      }
    }
  }

  function rows_from_responses(
    responses: {
      rows: FormResponse[];
      fields: { [key: string]: FormResponseField[] };
    },
    fields: FormFieldDefinition[]
  ) {
    return (
      responses.rows.map((response, index) => {
        const row: GFResponseRow = {
          __gf_id: response.id,
          __gf_display_id: fmt_local_index(response.local_index),
          __gf_created_at: response.created_at,
          __gf_customer_id: response.customer_id,
          fields: {},
        }; // react-data-grid expects each row to have a unique 'id' property

        fields.forEach((field) => {
          const responseField = responses.fields[response.id]?.find(
            (f) => f.form_field_id === field.id
          );
          row.fields[field.id] = {
            type: responseField?.type || field.type,
            value: responseField?.value || null,
            multiple: field.multiple || false,
            option_id: responseField?.form_field_option_id,
            options: field.options?.reduce(
              (
                acc: { [key: string]: { value: string; label?: string } },
                option
              ) => {
                acc[option.id] = {
                  value: option.value,
                  label: option.label,
                };
                return acc;
              },
              {}
            ),
            files:
              responseField?.storage_object_paths?.map((path) => {
                const base = `/private/editor/${response.form_id}/responses/${response.id}/fields/${responseField.id}/src?path=${path}`;
                const src = base + "&width=200";
                const download = base + "&download=true";
                const name = path.split("/").pop() ?? "";
                return {
                  src: src,
                  srcset: {
                    thumbnail: src,
                    original: base,
                  },
                  name,
                  download,
                };
              }) || [],
          };
        });
        return row;
      }) ?? []
    );
  }

  function rows_from_sessions(
    sessions: FormResponseSession[],
    fields: FormFieldDefinition[]
  ) {
    return (
      sessions?.map((session, index) => {
        const row: GFResponseRow = {
          __gf_id: session.id,
          __gf_display_id: session.id,
          __gf_created_at: session.created_at,
          __gf_customer_id: session.customer_id,
          fields: {},
        }; // react-data-grid expects each row to have a unique 'id' property
        Object.entries(session.raw || {}).forEach(([key, value]) => {
          const field = fields.find((f) => f.id === key);
          row.fields[key] = {
            value: value,
            type: field?.type,
          };
        });
        return row;
      }) ?? []
    );
  }

  function applyFilter<
    T extends FormResponse | FormResponseSession =
      | FormResponse
      | FormResponseSession,
  >(
    rows: Array<T>,
    filter: DataGridFilterSettings,
    datakey: keyof T = "raw"
  ): Array<T> {
    const { empty_data_hidden } = filter;
    return rows.filter((row) => {
      if (empty_data_hidden) {
        if (row === null) return false;
        if (row === undefined) return false;

        const v = row[datakey];
        return (
          v !== null &&
          v !== undefined &&
          v !== "" &&
          JSON.stringify(v) !== "{}" &&
          JSON.stringify(v) !== "[]"
        );
      }
      return true;
    });
  }
}
