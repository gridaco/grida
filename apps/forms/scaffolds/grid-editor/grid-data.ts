import type {
  FormFieldDefinition,
  FormInputType,
  FormResponse,
  FormResponseField,
  FormResponseSession,
  GridaSupabase,
} from "@/types";
import { fmt_local_index } from "@/utils/fmt";
import type { GFFile, GFResponseRow, GFSystemColumnTypes } from "../grid/types";
import type { DataGridFilterSettings, FormEditorState } from "../editor/state";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";
import { FieldSupports } from "@/k/supported_field_types";
import { PrivateEditorApi } from "@/lib/private";
import { GridFilter } from "../grid-filter";

export namespace GridData {
  type DataGridInput = {
    form_id: string;
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
    table: FormEditorState["datagrid_table"],
    fields: FormFieldDefinition[]
  ): {
    systemcolumns: {
      key: GFSystemColumnTypes;
      name?: string;
    }[];
    columns: {
      key: string;
      name: string;
      readonly: boolean;
      type?: FormInputType;
    }[];
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
      default:
        return {
          systemcolumns: [],
          columns: [],
        };
    }
  }

  export function rows(input: DataGridInput) {
    switch (input.table) {
      case "response": {
        return input.responses
          ? rows_from_responses(
              {
                rows: GridFilter.filter(
                  input.responses.rows,
                  input.filter,
                  "raw",
                  // response raw is saved with name: value
                  input.fields.map((f) => f.name)
                ),
                fields: input.responses.fields,
              },
              input.fields
            )
          : [];
      }
      case "session": {
        return input.sessions
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
          : [];
      }
      case "x-supabase-main-table": {
        const valuefn = (
          row: Record<string, any>,
          field: FormFieldDefinition
        ) => {
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

                const thumbnail =
                  PrivateEditorApi.FormFieldFile.file_preview_url({
                    params: {
                      form_id: input.form_id,
                      field_id: field.id,
                      filepath: path,
                    },
                    options: {
                      width: 200,
                    },
                  });

                const upsert =
                  PrivateEditorApi.FormFieldFile.file_request_upsert_url({
                    form_id: input.form_id,
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

        return GridFilter.filter(
          input.data.rows,
          input.filter,
          undefined,
          input.fields.map((f) => f.name)
        ).reduce((acc, row, index) => {
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
            value: responseField?.value,
            readonly: field.readonly || false,
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
                return gf_response_file({
                  form_id: response.form_id,
                  field_id: field.id,
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
}
