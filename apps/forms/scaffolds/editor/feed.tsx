"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { useDatabaseTableId, useEditorState, useFormFields } from "./use";
import toast from "react-hot-toast";
import {
  createClientFormsClient,
  createClientWorkspaceClient,
} from "@/lib/supabase/client";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import useSWR from "swr";
import type { EditorApiResponse } from "@/types/private/api";
import type { FormResponse, FormResponseField, GridaXSupabase } from "@/types";
import { usePrevious } from "@uidotdev/usehooks";
import { XSupabaseQuery } from "@/lib/supabase-postgrest/builder";
import equal from "deep-equal";
import { PrivateEditorApi } from "@/lib/private";
import { EditorSymbols } from "./symbols";
import type { TVirtualRow } from "./state";

type RealtimeTableChangeData = {
  id: string;
  [key: string]: any;
};

const useSubscription = ({
  table,
  form_id,
  onInsert,
  onUpdate,
  onDelete,
  enabled,
}: {
  table: "response" | "response_session";
  form_id?: string | null;
  onUpdate?: (data: RealtimeTableChangeData) => void;
  onInsert?: (data: RealtimeTableChangeData) => void;
  onDelete?: (data: RealtimeTableChangeData | {}) => void;
  enabled: boolean;
}) => {
  const supabase = useMemo(() => createClientFormsClient(), []);

  useEffect(() => {
    if (!form_id) return;
    if (!enabled) return;

    const channelname = `table-filter-changes-${table}-${form_id}`;

    const changes = supabase
      .channel(channelname)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "grida_forms",
          table,
          filter: `form_id=eq.${form_id}`,
        },
        async (
          payload: RealtimePostgresChangesPayload<RealtimeTableChangeData>
        ) => {
          const { old, new: _new } = payload;
          const old_id = (old as RealtimeTableChangeData).id;
          const new_id = (_new as RealtimeTableChangeData).id;

          if (new_id && old_id) {
            onUpdate?.(_new as RealtimeTableChangeData);
          } else if (new_id) {
            onInsert?.(_new as RealtimeTableChangeData);
          } else {
            onDelete?.(old);
          }
        }
      )
      .subscribe();

    return () => {
      changes.unsubscribe();
    };
  }, [supabase, form_id, table, enabled, onInsert, onUpdate, onDelete]);
};

function useFetchSchemaTableRows(table_id: string) {
  const supabase = useMemo(() => createClientFormsClient(), []);

  return useCallback(
    async (limit: number = 100) => {
      // fetch the responses
      const { data, error } = await supabase
        .from("response")
        .select(
          `
            *,
            fields:response_field(*)
          `
        )
        .eq("form_id", table_id)
        .order("local_index")
        .limit(limit);

      if (error) {
        throw new Error();
      }

      return data;
    },
    [supabase, table_id]
  );
}

function useFetchSchemaTableRow() {
  const supabase = useMemo(() => createClientFormsClient(), []);

  return useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from("response")
        .select(
          `
            *,
            fields:response_field(*)
          `
        )
        .eq("id", id)
        .single();

      if (error) {
        throw new Error();
      }

      return data;
    },
    [supabase]
  );
}

function useFetchResponseSessions(form_id: string) {
  const supabase = useMemo(() => createClientFormsClient(), []);

  return useCallback(
    async (limit: number = 100) => {
      // fetch the responses
      const { data, error } = await supabase
        .from("response_session")
        .select()
        .eq("form_id", form_id)
        .order("created_at")
        .limit(limit);

      if (error) {
        throw new Error();
      }

      return data;
    },
    [supabase, form_id]
  );
}

function useChangeDatagridLoading() {
  const [state, dispatch] = useEditorState();

  return useCallback(
    (loading: boolean) => {
      dispatch({
        type: "editor/data-grid/loading",
        isloading: loading,
      });
    },
    [dispatch]
  );
}

function useSyncCell() {
  const supabase = useMemo(() => createClientFormsClient(), []);

  return useCallback(
    async (id: string, payload: { value: any; option_id?: string | null }) => {
      const { data, error } = await supabase
        .from("response_field")
        .update({
          value: payload.value,
          form_field_option_id: payload.option_id,
          // TODO:
          // 'storage_object_paths': []
        })
        .eq("id", id)
        .select()
        .single();

      if (error || !data) {
        throw new Error();
      }

      return data;
    },
    [supabase]
  );
}

function useSyncCellChangesEffect(
  prev: Array<TVirtualRow<FormResponseField, FormResponse>> | undefined,
  current: Array<TVirtualRow<FormResponseField, FormResponse>> | undefined
) {
  const sync = useSyncCell();

  useEffect(() => {
    current?.forEach((r) => {
      r.data;
      Object.keys(r.data).forEach((attrkey) => {
        const cell = r.data[attrkey];
        const prevcell = prev?.find((pr) => pr.id === r.id)?.data[attrkey];
        // skip
        if (!prevcell) return;

        // check if field value is updated
        if (!equal(prevcell.value, cell.value)) {
          const _ = sync(cell.id, {
            value: cell.value,
            option_id: cell.form_field_option_id,
          });

          toast
            .promise(_, {
              loading: "Updating...",
              success: "Updated",
              error: "Failed",
            })
            .then((data) => {
              // TODO:
              // update state (although its already updated, but let's update it again with db response - triggers & other metadata)
            })
            .catch((error) => {
              // else revert the change
            });
        }
      });
    });
  }, [prev, current, sync]);
}

export function ResponseSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  const { tablespace } = state;
  const response_stream =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID].stream;
  const prev = usePrevious(response_stream);

  useSyncCellChangesEffect(prev, response_stream);

  return <>{children}</>;
}

export function ResponseFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const {
    form_id,
    datagrid_table_id,
    datagrid_rows_per_page,
    datagrid_table_refresh_key,
    tablespace,
  } = state;

  const { realtime: _realtime_responses_enabled } =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID];

  const setLoading = useChangeDatagridLoading();

  const fetchResponses = useFetchSchemaTableRows(form_id);

  const fetchResponse = useFetchSchemaTableRow();

  useEffect(() => {
    if (
      datagrid_table_id !==
      EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
    ) {
      return;
    }

    setLoading(true);
    const feed = fetchResponses(datagrid_rows_per_page).then((data) => {
      dispatch({
        type: "editor/table/space/feed",
        data: data as any,
        reset: true,
      });
    });

    toast
      .promise(feed, {
        loading: "Fetching responses...",
        success: "Responses fetched",
        error: "Failed to fetch responses",
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    dispatch,
    fetchResponses,
    setLoading,
    datagrid_rows_per_page,
    datagrid_table_id,
    datagrid_table_refresh_key,
  ]);

  useSubscription({
    table: "response",
    form_id,
    onInsert: (data) => {
      setTimeout(() => {
        const newresponse = fetchResponse((data as { id: string }).id).then(
          (data) => {
            dispatch({
              type: "editor/table/space/feed",
              data: [data as any],
            });
          }
        );

        toast.promise(
          newresponse,
          {
            loading: "Fetching new response...",
            success: "New response",
            error: "Failed to fetch new response",
          },
          { id: data.id }
        );
      }, 100);
    },
    onUpdate: (data) => {
      fetchResponse((data as { id: string }).id).then((data) => {
        dispatch({
          type: "editor/table/space/feed",
          data: [data as any],
        });
      });
    },
    onDelete: (data) => {
      if ("id" in data) {
        dispatch({
          type: "editor/response/delete",
          id: data.id,
        });
      }
    },
    enabled: _realtime_responses_enabled,
  });

  return <>{children}</>;
}

export function ResponseSessionFeedProvider({
  children,
  forceEnableRealtime,
}: React.PropsWithChildren<{
  forceEnableRealtime?: boolean;
}>) {
  const [state, dispatch] = useEditorState();

  const {
    form_id,
    datagrid_table_id,
    datagrid_rows_per_page,
    datagrid_table_refresh_key,
    tablespace,
  } = state;

  const { realtime: _realtime_sessions_enabled } =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID];

  const realtime_sessions_enabled =
    forceEnableRealtime ?? _realtime_sessions_enabled;

  const setLoading = useChangeDatagridLoading();

  const fetchResponseSessions = useFetchResponseSessions(form_id);

  useEffect(() => {
    if (
      datagrid_table_id !== EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID
    ) {
      return;
    }

    setLoading(true);

    const feed = fetchResponseSessions(datagrid_rows_per_page).then((data) => {
      dispatch({
        type: "editor/data/sessions/feed",
        data: data as any,
        reset: true,
      });
    });

    toast
      .promise(feed, {
        loading: "Fetching sessions...",
        success: "Sessions fetched",
        error: "Failed to fetch sessions",
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    dispatch,
    fetchResponseSessions,
    setLoading,
    datagrid_table_id,
    datagrid_rows_per_page,
    datagrid_table_refresh_key,
  ]);

  useSubscription({
    table: "response_session",
    form_id,
    onInsert: (data) => {
      dispatch({
        type: "editor/data/sessions/feed",
        data: [data as any],
      });
    },
    onUpdate: (data) => {
      dispatch({
        type: "editor/data/sessions/feed",
        data: [data as any],
      });
    },
    onDelete: (data) => {
      // this cant happen
    },
    enabled: realtime_sessions_enabled,
  });

  return <>{children}</>;
}

export function CustomerFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();
  const {
    project: { id: project_id },
    datagrid_table_id,
    datagrid_rows_per_page,
    datagrid_table_refresh_key,
  } = state;

  const client = createClientWorkspaceClient();

  const setLoading = useChangeDatagridLoading();

  useEffect(() => {
    if (datagrid_table_id !== EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID)
      return;

    setLoading(true);
    client
      .from("customer")
      .select()
      .order("last_seen_at", { ascending: false })
      .limit(datagrid_rows_per_page)
      .eq("project_id", project_id)
      .then(({ data, error }) => {
        setLoading(false);
        if (data) {
          dispatch({
            type: "editor/customers/feed",
            data: data,
          });
        }
      });
  }, [
    dispatch,
    setLoading,
    datagrid_table_id,
    datagrid_rows_per_page,
    project_id,
    datagrid_table_refresh_key,
    client,
  ]);

  return <>{children}</>;
}

export function XSupabaseMainTableSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();

  const { x_supabase_main_table } = state;

  const pref = usePrevious(x_supabase_main_table?.rows);

  const pkname = state.x_supabase_main_table?.gfpk;

  const update = useCallback(
    (key: number | string, value: Record<string, any>) => {
      if (!state.connections.supabase?.main_supabase_table_id) return;
      if (!pkname) return;

      const task = fetch(
        PrivateEditorApi.XSupabase.url_table_x_query(
          state.form_id,
          state.connections.supabase.main_supabase_table_id
        ),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: value,
            filters: [
              {
                type: "eq",
                column: pkname,
                value: key,
              },
            ],
          } satisfies XSupabaseQuery.Body),
        }
      );

      toast
        .promise(task, {
          loading: "Updating...",
          success: "Updated",
          error: "Failed",
        })
        .then((data) => {
          // NOTE: Do not dispatch data based on this result. this does not contain extended data
        });
    },
    [pkname, state.connections.supabase?.main_supabase_table_id, state.form_id]
  );

  useEffect(() => {
    if (!x_supabase_main_table?.rows) return;
    if (!pref) return;
    if (!pkname) return;

    const rows = x_supabase_main_table.rows;

    // check if rows are updated
    for (const row of rows) {
      const prevRow = pref.find((r) => r.id === row.id);

      if (prevRow) {
        // get changed fields
        const diff = rowdiff(prevRow, row, (key) => key.startsWith("__gf_"));
        if (Object.keys(diff).length > 0) {
          update(row[pkname], diff);
        }
      }
    }
  }, [pkname, pref, update, x_supabase_main_table]);

  return <>{children}</>;
}

export function XSupabaseMainTableFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const fields = useFormFields();

  const {
    datagrid_rows_per_page,
    datagrid_table_refresh_key,
    datagrid_orderby,
  } = state;

  const serachParams = useMemo(() => {
    return PrivateEditorApi.SupabaseQuery.makeQueryParams({
      limit: datagrid_rows_per_page,
      order: datagrid_orderby,
      refreshKey: datagrid_table_refresh_key,
    });
  }, [datagrid_rows_per_page, datagrid_orderby, datagrid_table_refresh_key]);

  const enabled = !!state.connections.supabase?.main_supabase_table_id;

  const request = state.connections.supabase?.main_supabase_table_id
    ? PrivateEditorApi.XSupabase.url_table_x_query(
        state.form_id,
        state.connections.supabase.main_supabase_table_id,
        serachParams
      )
    : null;

  const res = useSWR<EditorApiResponse<GridaXSupabase.XDataRow[], any>>(
    request,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      // disable this since this feed replaces (not updates) the data, which causes the ui to refresh, causing certain ux fails (e.g. dialog on cell)
      revalidateOnFocus: false,
    }
  );

  useEffect(() => {
    if (!enabled) return;
    dispatch({
      type: "editor/data-grid/loading",
      isloading: res.isLoading || res.isValidating,
    });
  }, [dispatch, enabled, res.isLoading, res.isValidating]);

  useEffect(() => {
    if (!enabled) return;
    // trigger data refresh
    dispatch({
      type: "editor/data-grid/refresh",
    });
  }, [dispatch, enabled, fields]);

  useEffect(() => {
    if (res.data?.data) {
      const rows = res.data.data;

      dispatch({
        type: "editor/x-supabase/main-table/feed",
        data: rows,
      });
    }
  }, [dispatch, res.data, state.form_id]);

  return <>{children}</>;
}

export function SchemaTableSyncProvider({
  table_id,
  children,
}: React.PropsWithChildren<{
  table_id: string;
}>) {
  const [state] = useEditorState();
  const { tablespace } = state;
  const stream = tablespace[table_id].stream;
  const prev = usePrevious(stream);

  useSyncCellChangesEffect(prev, stream);

  return <>{children}</>;
}

export function SchemaTableFeedProvider({
  table_id,
  children,
}: React.PropsWithChildren<{
  table_id: string;
}>) {
  const [state, dispatch] = useEditorState();

  const { datagrid_rows_per_page, datagrid_table_refresh_key, tablespace } =
    state;

  const { realtime: _realtime_responses_enabled } = tablespace[table_id];

  const setLoading = useChangeDatagridLoading();

  const fetchTableRows = useFetchSchemaTableRows(table_id);

  const fetchTableRow = useFetchSchemaTableRow();

  useEffect(() => {
    if (typeof table_id !== "string") return;
    setLoading(true);
    const feed = fetchTableRows(datagrid_rows_per_page).then((data) => {
      dispatch({
        type: "editor/table/space/feed",
        data: data as any,
        reset: true,
      });
    });

    toast
      .promise(feed, {
        loading: "Loading...",
        success: "Loaded",
        error: "Failed to load",
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    dispatch,
    fetchTableRows,
    setLoading,
    table_id,
    datagrid_rows_per_page,
    datagrid_table_refresh_key,
  ]);

  useSubscription({
    table: "response",
    form_id: table_id,
    onInsert: (data) => {
      setTimeout(() => {
        const newresponse = fetchTableRow((data as { id: string }).id).then(
          (data) => {
            dispatch({
              type: "editor/table/space/feed",
              data: [data as any],
            });
          }
        );

        toast.promise(
          newresponse,
          {
            loading: "Fetching new Entry",
            success: "New Entry",
            error: "Failed to fetch new Entry",
          },
          { id: data.id }
        );
      }, 100);
    },
    onUpdate: (data) => {
      fetchTableRow((data as { id: string }).id).then((data) => {
        dispatch({
          type: "editor/table/space/feed",
          data: [data as any],
        });
      });
    },
    onDelete: (data) => {
      if ("id" in data) {
        dispatch({
          type: "editor/response/delete",
          id: data.id,
        });
      }
    },
    enabled: _realtime_responses_enabled,
  });

  return <>{children}</>;
}

function rowdiff(
  prevRow: Record<string, any>,
  newRow: Record<string, any>,
  ignoreKey?: (key: string) => boolean
) {
  const changedFields: Record<string, any> = {};
  for (const key in newRow) {
    if (ignoreKey && ignoreKey(key)) {
      continue;
    }
    if (!equal(newRow[key], prevRow[key])) {
      changedFields[key] = newRow[key];
    }
  }
  return changedFields;
}
