import { produce, type Draft } from "immer";
import type {
  DatabaseAction,
  DatabaseTableSpaceFeedProviderXSupabaseAction,
  DatabaseTableSpaceFeedAction,
  DatabaseTableSpaceSelectRowsAction,
  DatabaseTableSpaceCellChangeAction,
  DatabaseTableSpaceDeleteSelectedRowsAction,
  DatabaseTableSpaceDeleteRowAction,
  DatabaseTableSpaceFeedResponseSessionsAction,
} from "../action";
import type {
  EditorState,
  GDocFormsXSBTable,
  GDocSchemaTableProviderXSupabase,
  GDocTable,
  GDocTableID,
  TGridaDataTablespace,
  TTablespace,
  TVirtualRow,
  TVirtualRowData,
  TXSupabaseDataTablespace,
} from "../state";
import { FormResponse, FormResponseField, GridaXSupabase } from "@/types";
import assert from "assert";
import { EditorSymbols } from "../symbols";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";

export default function databaseRecucer(
  state: EditorState,
  action: DatabaseAction
): EditorState {
  switch (action.type) {
    case "editor/table/space/rows/select": {
      const { selection } = <DatabaseTableSpaceSelectRowsAction>action;
      return produce(state, (draft) => {
        draft.datagrid_selected_rows = new Set(selection);
      });
    }
    case "editor/table/space/rows/delete/selected": {
      const {} = <DatabaseTableSpaceDeleteSelectedRowsAction>action;
      return produce(state, (draft) => {
        // adjust the query count
        draft.datagrid_query_estimated_count =
          (draft.datagrid_query_estimated_count || 0) -
          state.datagrid_selected_rows.size;

        switch (draft.datagrid_table_id) {
          case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID: {
            const ids = Array.from(state.datagrid_selected_rows);

            const response_space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
              ];
            response_space.stream = response_space.stream?.filter(
              (response) => !ids.includes(response.id)
            );

            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID: {
            const tb = get_table<GDocFormsXSBTable>(
              draft,
              EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
            );
            if (!tb) return;

            const pk = tb.x_sb_main_table_connection.pk!;
            const space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
              ];

            space.stream = space.stream?.filter(
              (row) => !state.datagrid_selected_rows.has(row[pk])
            );

            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID: {
            throw new Error(
              "Unsupported table type: " + state.datagrid_table_id?.toString()
            );
          }
          default:
            if (draft.doctype === "v0_schema") {
              //
              const space = get_tablespace_feed(draft);

              const ids = Array.from(state.datagrid_selected_rows);

              assert(space, "Table space not found");

              space.stream = space.stream?.filter(
                (response) => !ids.includes(response.id)
              );
            } else {
              throw new Error(
                "Unsupported table type: " + state.datagrid_table_id?.toString()
              );
            }
        }

        // clear selected rows
        draft.datagrid_selected_rows = new Set();
      });
    }
    case "editor/table/space/rows/delete": {
      const { id } = <DatabaseTableSpaceDeleteRowAction>action;
      return produce(state, (draft) => {
        const space = get_tablespace_feed(draft);
        if (!space) {
          console.error("Table space not found");
          return;
        }

        space.stream = space.stream?.filter((row) => row.id !== id);

        // also remove from selected_responses
        const new_selected_responses = new Set(state.datagrid_selected_rows);
        new_selected_responses.delete(id);

        draft.datagrid_selected_rows = new_selected_responses;
      });
    }
    case "editor/table/space/feed": {
      const { table_id, data } = <DatabaseTableSpaceFeedAction>action;

      const virtualized: Array<TVirtualRow<FormResponseField, FormResponse>> =
        data.map((vrow) => {
          const { fields, ...row } = vrow;
          return {
            id: row.id,
            data: fields.reduce(
              (acc: TVirtualRowData<FormResponseField>, field) => {
                const attrkey = field.form_field_id;
                acc[attrkey] = field;
                return acc;
              },
              {}
            ),
            meta: row,
          };
        });

      return produce(state, (draft) => {
        const space = get_tablespace(draft, table_id) as TGridaDataTablespace;

        assert(space, "Table space not found");
        assert(space.provider === "grida", "Table space provider is not grida");

        if (action.reset) {
          // update the query count
          draft.datagrid_query_estimated_count = action.count;

          // reset the stream
          space.stream = virtualized;
          return;
        }

        // Merge & Add new responses to the existing responses
        // Map of ids to responses for the existing responses
        // { [id] : row}
        const existing_rows_id_map = space.stream?.reduce((acc: any, row) => {
          acc[row.id] = row;
          return acc;
        }, {});

        let cnt_added = 0;

        virtualized.forEach((newRow) => {
          if (existing_rows_id_map.hasOwnProperty(newRow.id)) {
            // Update existing response
            Object.assign((existing_rows_id_map as any)[newRow.id], newRow);
          } else {
            // Add new response if id does not exist
            space.stream?.push(newRow);
            cnt_added++;
          }
        });

        // adjust the query count
        draft.datagrid_query_estimated_count =
          (draft.datagrid_query_estimated_count || 0) + cnt_added;
      });
    }
    case "editor/table/space/feed/x-supabase": {
      const { data, count, table_id } = <
        DatabaseTableSpaceFeedProviderXSupabaseAction
      >action;

      return produce(state, (draft) => {
        draft.tablespace[table_id].stream = data;
        draft.datagrid_query_estimated_count = count;
      });
      //
    }
    case "editor/table/space/feed/sessions": {
      const { data } = <DatabaseTableSpaceFeedResponseSessionsAction>action;
      return produce(state, (draft) => {
        // Initialize session stream if it's not already an array
        const session_space =
          draft.tablespace[
            EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID
          ];

        if (!Array.isArray(session_space.stream)) {
          session_space.stream = [];
        }

        if (action.reset) {
          // update the query count
          draft.datagrid_query_estimated_count = action.count;
          // reset the stream
          session_space.stream = data;
          return;
        }

        // Merge & Add new responses to the existing responses
        // Map of ids to responses for the existing responses
        const existingSessionsById = session_space.stream.reduce(
          (acc: any, session) => {
            acc[session.id] = session;
            return acc;
          },
          {}
        );

        let cnt_added = 0;

        data.forEach((newSession) => {
          if (existingSessionsById.hasOwnProperty(newSession.id)) {
            // Update existing response
            Object.assign(
              (existingSessionsById as any)[newSession.id],
              newSession
            );
          } else {
            // Add new response if id does not exist
            session_space.stream?.push(newSession);

            cnt_added++;
          }
        });

        // adjust the query count
        draft.datagrid_query_estimated_count =
          (draft.datagrid_query_estimated_count || 0) + cnt_added;
      });
    }
    case "editor/table/space/cell/change": {
      return produce(state, (draft) => {
        switch (draft.datagrid_table_id) {
          case EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID: {
            const {
              row: row_id,
              column: attribute_id,
              data,
            } = <DatabaseTableSpaceCellChangeAction>action;
            const { value, option_id } = data;

            const response_space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
              ];
            const cell = response_space.stream?.find(
              (row) => row.id === row_id
            )!.data[attribute_id];

            if (!cell) return;

            cell.value = value;
            cell.form_field_option_id = option_id ?? null;

            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID: {
            const space =
              draft.tablespace[
                EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
              ];

            const tb = get_table<GDocFormsXSBTable>(
              draft,
              EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID
            );
            if (!tb) return;
            const pk = tb.x_sb_main_table_connection.pk!;

            update_xsbtablespace(pk, space, draft, action);
            break;
          }
          case EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID: {
            throw new Error(
              "Unsupported table type: " + state.datagrid_table_id?.toString()
            );
          }
          default: {
            if (draft.doctype === "v0_schema") {
              const {
                row: row_id,
                column: attribute_id,
                data,
              } = <DatabaseTableSpaceCellChangeAction>action;
              const { value, option_id } = data;

              const space = get_tablespace_feed(draft);
              assert(space, "Table space not found");

              switch (space?.provider) {
                case "grida": {
                  const cell = space.stream?.find((row) => row.id === row_id)!
                    .data[attribute_id];

                  if (!cell) return;

                  cell.value = value;
                  cell.form_field_option_id = option_id ?? null;
                  break;
                }
                case "x-supabase": {
                  const space = draft.tablespace[action.table_id];
                  assert(space.provider === "x-supabase");

                  const tb = get_table<GDocSchemaTableProviderXSupabase>(
                    draft,
                    action.table_id
                  );

                  if (!tb) return;

                  const pk = tb.x_sb_main_table_connection.pk!;

                  update_xsbtablespace(
                    pk,
                    space as TXSupabaseDataTablespace,
                    draft,
                    action
                  );
                  break;
                }
                case "custom":
                default:
                  throw new Error(
                    "Unsupported table provider: " + space?.provider
                  );
              }

              break;
            } else {
              throw new Error(
                "Unsupported table type: " + state.datagrid_table_id?.toString()
              );
            }
          }
        }
      });
    }
  }
  return state;
}

function get_tablespace(draft: Draft<EditorState>, table_id: GDocTableID) {
  return draft.tablespace[table_id];
}

function get_table<T extends GDocTable>(
  draft: Draft<EditorState>,
  table_id: GDocTableID
): Draft<Extract<GDocTable, T>> | undefined {
  return draft.tables.find((t) => t.id === table_id) as Draft<
    Extract<GDocTable, T>
  >;
}

/**
 * @deprecated
 * @returns
 */
function get_tablespace_feed(
  draft: Draft<EditorState>
): Draft<TTablespace> | null {
  switch (draft.doctype) {
    case "v0_form":
      return draft.tablespace[
        EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
      ];
    case "v0_schema":
      if (typeof draft.datagrid_table_id === "string")
        return draft.tablespace[draft.datagrid_table_id] as TTablespace;
    default:
      return null;
  }
  //
}

function update_xsbtablespace(
  pk: string,
  space: Draft<TXSupabaseDataTablespace>,
  draft: Draft<EditorState>,
  action: DatabaseTableSpaceCellChangeAction
) {
  const { row: row_pk, table_id, column, data } = action;
  const { value, option_id } = data;

  const attributes = get_attributes(draft, table_id);
  const attribute = attributes.find((f) => f.id === column);
  if (!attribute) return;

  // handle jsonpaths - partial object update
  if (FlatPostgREST.testPath(attribute.name)) {
    const { column } = FlatPostgREST.decodePath(attribute.name);
    const row = space.stream!.find((r) => r[pk] === row_pk);

    if (!row) return;

    const newrow = FlatPostgREST.update(
      row,
      attribute.name,
      value
    ) as GridaXSupabase.XDataRow;

    space.stream = space.stream!.map((r) => {
      if (r[pk] === row_pk) {
        return newrow;
      }
      return r;
    });

    return;
  }

  space.stream = space.stream!.map((r) => {
    if (r[pk] === row_pk) {
      return {
        ...r,
        [attribute!.name]: value,
      };
    }
    return r;
  });
}

export function get_attributes(
  draft: Draft<EditorState>,
  table_id: GDocTableID
) {
  switch (draft.doctype) {
    case "v0_form":
      return draft.form.fields;

    case "v0_schema": {
      const tb = draft.tables.find((t) => t.id === table_id);
      assert(tb, "Table not found");
      assert("attributes" in tb, "Not a valid table");
      return tb.attributes;
    }
    default:
      throw new Error("cannot get attributes - unsupported doctype");
  }
}
