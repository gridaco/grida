import {
  Customer,
  FormFieldDefinition,
  FormInputType,
  FormResponse,
  FormResponseField,
  FormResponseSession,
  GridaSupabase,
} from "@/types";
import { fmt_local_index } from "@/utils/fmt";
import type {
  GFColumn,
  GFFile,
  GFResponseRow,
  GFSystemColumn,
  GFSystemColumnTypes,
} from "../grid/types";
import type {
  DataGridFilterSettings,
  GDocTableID,
  TVirtualRow,
} from "../editor/state";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";
import { FieldSupports } from "@/k/supported_field_types";
import { PrivateEditorApi } from "@/lib/private";
import { GridFilter } from "../grid-filter";
import { EditorSymbols } from "../editor/symbols";

export namespace GridData {
  type DataGridInput =
    | ({
        form_id: string;
        fields: FormFieldDefinition[];
        filter: DataGridFilterSettings;
      } & (
        | {
            table: typeof EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID;
            responses: Array<TVirtualRow<FormResponseField, FormResponse>>;
          }
        | {
            table: typeof EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID;
            sessions: FormResponseSession[];
          }
        | {
            table: typeof EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID;
            data: {
              pks: string[];
              rows: any[];
            };
          }
      ))
    | {
        filter: DataGridFilterSettings;
        table: typeof EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID;
        data: {
          rows: Customer[];
        };
      }
    | {
        filter: DataGridFilterSettings;
        table: typeof EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID;
        data: {
          rows: any[];
        };
      }
    | {
        filter: DataGridFilterSettings;
        table: "v0_schema_table";
        table_id: string;
        attributes: FormFieldDefinition[];
        rows: Array<TVirtualRow<FormResponseField, FormResponse>>;
      };

  export function columns(
    table: GDocTableID,
    fields: FormFieldDefinition[]
  ): {
    systemcolumns: GFSystemColumn[];
    columns: GFColumn[];
  } {
    const fieldcolumns = Array.from(fields)
      .sort((a, b) => a.local_index - b.local_index)
      .map((field) => ({
        key: field.id,
        name: field.name,
        readonly: field.readonly || false,
        type: field.type,
      }));

    switch (table) {
      case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID:
      case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID: {
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
      case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID: {
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
      default:
        return {
          systemcolumns: [],
          columns: fieldcolumns,
        };
    }
  }

  type TProcessedGridRows =
    | {
        type: "response";
        inputlength: number;
        filtered: GFResponseRow[];
      }
    | {
        type: "session";
        inputlength: number;
        filtered: GFResponseRow[];
      }
    | {
        type: "customer";
        inputlength: number;
        filtered: Customer[];
      }
    | {
        type: "x-supabase-auth.users";
        inputlength: number;
        // FIXME: add type
        filtered: any[];
      };

  export function rows(input: DataGridInput): TProcessedGridRows {
    switch (input.table) {
      case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID: {
        const filtered = GridFilter.filter(
          input.responses,
          input.filter,
          (row) => row.meta.raw,
          // response raw is saved with name: value
          input.fields.map((f) => f.name)
        );

        return {
          type: "response",
          inputlength: input.responses.length || 0,
          filtered: rows_from_responses(filtered, input.fields),
        };
      }
      case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID: {
        return {
          type: "session",
          inputlength: input.sessions?.length || 0,
          filtered: input.sessions
            ? rows_from_sessions(
                GridFilter.filter(
                  input.sessions,
                  input.filter,
                  "raw",
                  // session raw is saved with id: value
                  input.fields.map((f) => f.id)
                ),
                input.fields
              )
            : [],
        };
      }
      case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID: {
        return {
          type: "response",
          inputlength: input.data.rows.length,
          filtered: rows_from_x_supabase_main_table({
            form_id: input.form_id,
            // TODO: support multiple PKs
            pk: input.data.pks.length > 0 ? input.data.pks[0] : null,
            fields: input.fields,
            rows: GridFilter.filter(
              input.data.rows,
              input.filter,
              undefined,
              input.fields.map((f) => f.name)
            ),
          }),
        };
      }
      case EditorSymbols.Table.SYM_GRIDA_X_SUPABASE_AUTH_USERS_TABLE_ID: {
        return {
          type: "x-supabase-auth.users",
          inputlength: input.data.rows.length,
          filtered: GridFilter.filter(
            input.data.rows,
            input.filter,
            undefined,
            Object.keys(GridaSupabase.SupabaseUserJsonSchema.properties)
          ),
        };
      }
      case EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID: {
        return {
          type: "customer",
          inputlength: input.data.rows.length,
          // @ts-ignore - FIXME:
          filtered: GridFilter.filter(
            input.data.rows,
            input.filter,
            undefined,
            [
              "uid",
              "email",
              "email_provisional",
              "phone",
              "created_at",
              "last_seen_at",
            ]
          ),
        };
      }
      case "v0_schema_table": {
        //
        const filtered = GridFilter.filter(
          input.rows,
          input.filter,
          (row) => row.meta.raw,
          // response raw is saved with name: value
          input.attributes.map((f) => f.name)
        );

        return {
          type: "response",
          inputlength: input.rows.length || 0,
          filtered: rows_from_responses(filtered, input.attributes),
        };
      }
    }
  }

  function rows_from_responses(
    responses: Array<TVirtualRow<FormResponseField, FormResponse>>,
    attributes: FormFieldDefinition[]
  ): Array<GFResponseRow> {
    return (
      responses.map((response, index) => {
        const row: GFResponseRow = {
          __gf_id: response.id,
          __gf_display_id: fmt_local_index(response.meta.local_index),
          __gf_created_at: response.meta.created_at,
          __gf_customer_id: response.meta.customer_id,
          fields: {},
        }; // react-data-grid expects each row to have a unique 'id' property

        attributes.forEach((attribute) => {
          const cell: FormResponseField = response.data[attribute.id];

          row.fields[attribute.id] = {
            type: cell?.type || attribute.type,
            value: cell?.value,
            readonly: attribute.readonly || false,
            multiple: attribute.multiple || false,
            option_id: cell?.form_field_option_id,
            options: attribute.options?.reduce(
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
              cell?.storage_object_paths?.map((path) => {
                return gf_response_file({
                  form_id: response.meta.form_id,
                  field_id: attribute.id,
                  filepath: path,
                });
              }) || [],
          };
        });
        return row;
      }) ?? []
    );
  }

  function gf_response_file(params: {
    form_id: string;
    field_id: string;
    filepath: string;
  }): GFFile {
    const base = PrivateEditorApi.FormFieldFile.file_preview_url({
      params: params,
    });
    const src = PrivateEditorApi.FormFieldFile.file_preview_url({
      params: params,
      options: { width: 200 },
    });

    const download = PrivateEditorApi.FormFieldFile.file_preview_url({
      params: params,
      options: { download: true },
    });

    const name = params.filepath.split("/").pop() ?? "";

    // TODO: upsert - file upsert is not ready for responses

    return {
      src: src,
      srcset: {
        thumbnail: src,
        original: base,
      },
      name,
      download,
    };
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
            readonly: field?.readonly || false,
          };
        });
        return row;
      }) ?? []
    );
  }

  function rows_from_x_supabase_main_table({
    pk,
    form_id,
    fields,
    rows,
  }: {
    pk: string | null;
    form_id: string;
    fields: FormFieldDefinition[];
    rows: any[];
  }) {
    const valuefn = (row: Record<string, any>, field: FormFieldDefinition) => {
      // jsonpath field
      if (FlatPostgREST.testPath(field.name)) {
        return FlatPostgREST.get(field.name, row);
      }

      return row[field.name];
    };

    const filesfn = (
      row: GridaSupabase.XDataRow,
      field: FormFieldDefinition
    ) => {
      // file field
      if (
        FieldSupports.file_alias(field.type) &&
        row.__gf_storage_fields[field.id]
      ) {
        const objects = row.__gf_storage_fields[field.id];
        return objects
          ?.map((obj) => {
            const { path, signedUrl } = obj;

            const thumbnail = PrivateEditorApi.FormFieldFile.file_preview_url({
              params: {
                form_id: form_id,
                field_id: field.id,
                filepath: path,
              },
              options: {
                width: 200,
              },
            });

            const upsert =
              PrivateEditorApi.FormFieldFile.file_request_upsert_url({
                form_id: form_id,
                field_id: field.id,
                filepath: path,
              });

            return {
              // use thumbnail as src
              src: thumbnail,
              srcset: {
                thumbnail: thumbnail,
                original: signedUrl,
              },
              // use path as name for x-supabase
              name: path,
              download: signedUrl,
              upsert: upsert,
            } satisfies GFFile;
          })
          .filter((f) => f) as GFFile[] | [];
      }
    };

    return rows.reduce((acc, row, index) => {
      const gfRow: GFResponseRow = {
        __gf_id: pk ? row[pk] : "",
        __gf_display_id: pk ? row[pk] : "",
        fields: {},
      };
      fields.forEach((field) => {
        gfRow.fields[field.id] = {
          type: field.type,
          value: valuefn(row, field),
          readonly: field.readonly || false,
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
          files: filesfn(row, field),
        };
      });
      acc.push(gfRow);
      return acc;
    }, []);
  }
}
