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
  DatabaseTableSchemaAddAction,
  DatabaseTableSchemaDeleteAction,
  DatabaseTableAttributeChangeAction,
  DatabaseTableAttributeDeleteAction,
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
import {
  AttributeDefinition,
  FormResponse,
  FormResponseField,
  GridaXSupabase,
} from "@/types";
import assert from "assert";
import { EditorSymbols } from "../symbols";
import { FlatPostgREST } from "@/lib/supabase-postgrest/flat";
import { schematableinit, table_to_sidebar_table_menu } from "../init";
import { v4 } from "uuid";

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
              const space = get_current_tablespace_feed(draft);

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
        const space = get_current_tablespace_feed(draft);
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
      const {
        gdoc_table_id,
        table_id,
        row: row_id,
        column: attribute_id,
        data,
      } = <DatabaseTableSpaceCellChangeAction>action;

      return produce(state, (draft) => {
        const tb = get_table(draft, gdoc_table_id);
        assert(tb, "Table not found");

        const space = get_tablespace(draft, gdoc_table_id);
        assert(space, "Table space not found");

        switch (tb.provider) {
          case "x-supabase-auth":
          case "custom":
            throw new Error("Unsupported table provider: " + tb.provider);
          case "grida": {
            // TODO: provider:grida also needs to be migrated with transaction methhod of syncing data.
            // @see feed.tsx - no changes required here.

            assert(space.provider === "grida");

            const { value, option_id } = data;
            const cell = space.stream?.find((row) => row.id === row_id)!.data[
              attribute_id
            ];

            if (!cell) return;

            cell.value = value;
            cell.form_field_option_id = option_id ?? null;
            break;
          }
          case "x-supabase": {
            assert(space.provider === "x-supabase");

            const pk = tb.x_sb_main_table_connection.pk!;

            update_xsbtablespace(pk, space, draft, action);

            // add to transactions
            space.transactions.push({
              digest: v4(),
              timestamp: Date.now(),
              user: "user",
              operation: "update",
              table_id: table_id,
              column: attribute_id,
              row: row_id,
              data: data,
            });
            break;
          }
          default:
            throw new Error("Unsupported table provider");
        }
      });
    }
    case "editor/table/attribute/change": {
      const { table_id, field_id, data } = <DatabaseTableAttributeChangeAction>(
        action
      );

      return produce(state, (draft) => {
        // clear init
        draft.field_editor.data = { draft: null };

        // update (create) the changed attribute
        const attributes = get_attributes(draft, table_id);
        const { isnew } = push_or_update_attribute(attributes, data);

        if (draft.doctype === "v0_form") {
          if (isnew) {
            // assign the field_id to the block if required
            let unused_field_id: string | null = field_id;
            const waiting_block = has_waiting_block_for_new_field(draft);

            if (waiting_block) {
              waiting_block.form_field_id = unused_field_id;
              unused_field_id = null;
            } else {
              // add the field_id to available_field_ids
              draft.form.available_field_ids.push(unused_field_id);
            }
          }
        }
        //
      });
    }
    case "editor/table/attribute/delete": {
      const { table_id, field_id } = <DatabaseTableAttributeDeleteAction>action;
      return produce(state, (draft) => {
        const attributes = get_attributes(draft, table_id);

        // [EXECUTION ORDER MATTERS] remove from attributes (using below syntax since attribute is a const - still a draft proxy)
        const new_attributes = attributes.filter(
          (attr) => attr.id !== field_id
        );
        attributes.length = 0;
        attributes.push(...new_attributes);
        //

        if (draft.doctype === "v0_form") {
          // remove from available_field_ids
          draft.form.available_field_ids =
            draft.form.available_field_ids.filter((id) => id !== field_id);

          // set empty to referenced blocks
          draft.blocks = draft.blocks.map((block) => {
            if (block.form_field_id === field_id) {
              block.form_field_id = null;
            }
            return block;
          });
        }
      });
    }
    case "editor/table/schema/add": {
      const { table } = <DatabaseTableSchemaAddAction>action;
      return produce(state, (draft) => {
        const tb = schematableinit(table);
        draft.tables.push(tb as Draft<GDocTable>);
        draft.sidebar.mode_data.tables.push(
          table_to_sidebar_table_menu(tb, {
            basepath: draft.basepath,
            document_id: draft.document_id,
          })
        );

        if (table.x_sb_main_table_connection) {
          draft.tablespace[tb.id] = {
            provider: "x-supabase",
            readonly: false,
            stream: [],
            realtime: false,
            transactions: [],
          };
        } else {
          draft.tablespace[tb.id] = {
            provider: "grida",
            readonly: false,
            stream: [],
            realtime: true,
            // transactions: [],
          };
        }

        // TODO: setting the id won't change the route. need to update the route. (where?)
        draft.datagrid_table_id = table.id;
      });
    }
    case "editor/table/schema/delete": {
      const { table_id } = <DatabaseTableSchemaDeleteAction>action;
      return produce(state, (draft) => {
        const table = draft.tables.find((t) => t.id === table_id);
        if (table) {
          draft.tables = draft.tables.filter((t) => t.id !== table_id);
          draft.sidebar.mode_data.tables =
            draft.sidebar.mode_data.tables.filter((t) => t.id !== table_id);
          delete draft.tablespace[table_id];
          draft.datagrid_table_id = null;
        }
      });
    }
  }
  return state;
}

function get_table<T extends GDocTable>(
  draft: Draft<EditorState>,
  table_id: GDocTableID
): Draft<Extract<GDocTable, T>> | undefined {
  return draft.tables.find((t) => t.id === table_id) as Draft<
    Extract<GDocTable, T>
  >;
}

function get_tablespace(draft: Draft<EditorState>, table_id: GDocTableID) {
  return draft.tablespace[table_id];
}

/**
 * @deprecated
 * @returns
 */
function get_current_tablespace_feed(
  draft: Draft<EditorState>
): Draft<TTablespace> | null {
  switch (draft.doctype) {
    case "v0_form":
      return get_tablespace(
        draft,
        EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
      );
    case "v0_schema":
      if (typeof draft.datagrid_table_id === "string")
        return get_tablespace(draft, draft.datagrid_table_id) as TTablespace;
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

function push_or_update_attribute(
  attributes: Draft<Array<AttributeDefinition>>,
  data: AttributeDefinition
) {
  const attribute = attributes.find((f) => f.id === data.id);
  if (attribute) {
    Object.assign(attribute, { ...data });
    return {
      isnew: false,
      attribute,
    };
  } else {
    attributes.push(data);
    return {
      isnew: true,
      attribute: attributes.find((f) => f.id === data.id),
    };
  }
}

/**
 * check if there is a waiting block for new field.
 * when creating a new field on certain ux, we create the block first then open a new field panel, once saved, we may use this for finding the block.
 * @param draft
 * @returns
 */
function has_waiting_block_for_new_field(draft: Draft<EditorState>) {
  if (draft.focus_block_id) {
    const block = draft.blocks.find((d) => d.id == draft.focus_block_id);

    if (block && block.type === "field" && !block.form_field_id) {
      return block;
    }

    return false;
  }
}
