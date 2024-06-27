"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { useEditorState } from "./provider";
import toast from "react-hot-toast";
import { createClientFormsClient } from "@/lib/supabase/client";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import useSWR from "swr";
import type { EditorApiResponse } from "@/types/private/api";
import type { FormResponseField, GridaSupabase } from "@/types";
import { usePrevious } from "@uidotdev/usehooks";
import { XSupabaseQuery } from "@/lib/supabase-postgrest/builder";
import equal from "deep-equal";

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
  form_id: string;
  onUpdate?: (data: RealtimeTableChangeData) => void;
  onInsert?: (data: RealtimeTableChangeData) => void;
  onDelete?: (data: RealtimeTableChangeData | {}) => void;
  enabled: boolean;
}) => {
  const supabase = useMemo(() => createClientFormsClient(), []);

  useEffect(() => {
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

export function ResponseSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  const supabase = useMemo(() => createClientFormsClient(), []);
  const prev = usePrevious(state.responses);

  const sync = useCallback(
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

  useEffect(() => {
    //

    Object.keys(state.responses.fields).forEach((key) => {
      const fields = state.responses.fields[key];

      // - if field id is draft and value is not empty, create a new response field - we don't handle this case - there will be no empty cells (db trigger)
      // - if field id is not draft and value is updated, update the response field
      // - we don't handle delete since field can't be deleted individually (deletes when row deleted)

      for (const cell of fields) {
        const prevField = prev?.fields[key]?.find(
          (f: FormResponseField) => f.id === cell.id
        );

        if (prevField) {
          // check if field value is updated
          if (prevField.value !== cell.value) {
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
        }
      }
    });
  }, [prev?.fields, state.responses, sync]);

  return <>{children}</>;
}

export function ResponseFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const {
    form_id,
    datagrid_table,
    datagrid_rows_per_page,
    realtime_responses_enabled,
  } = state;

  const supabase = useMemo(() => createClientFormsClient(), []);

  const fetchResponses = useCallback(
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
        .eq("form_id", form_id)
        .order("local_index")
        .limit(limit);

      if (error) {
        throw new Error();
      }

      return data;
    },
    [supabase, form_id]
  );

  const fetchResponse = useCallback(
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

  useEffect(() => {
    if (datagrid_table !== "response") return;
    const feed = fetchResponses(datagrid_rows_per_page).then((data) => {
      dispatch({
        type: "editor/response/feed",
        data: data as any,
        reset: true,
      });
    });

    toast.promise(feed, {
      loading: "Fetching responses...",
      success: "Responses fetched",
      error: "Failed to fetch responses",
    });
  }, [dispatch, fetchResponses, datagrid_rows_per_page, datagrid_table]);

  useSubscription({
    table: "response",
    form_id,
    onInsert: (data) => {
      setTimeout(() => {
        const newresponse = fetchResponse((data as { id: string }).id).then(
          (data) => {
            dispatch({
              type: "editor/response/feed",
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
          type: "editor/response/feed",
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
    enabled: realtime_responses_enabled,
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
    datagrid_table,
    datagrid_rows_per_page,
    realtime_sessions_enabled: _realtime_sessions_enabled,
  } = state;

  const realtime_sessions_enabled =
    forceEnableRealtime ?? _realtime_sessions_enabled;

  const supabase = useMemo(() => createClientFormsClient(), []);

  const fetchResponseSessions = useCallback(
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

  useEffect(() => {
    if (datagrid_table !== "session") return;

    const feed = fetchResponseSessions(datagrid_rows_per_page).then((data) => {
      dispatch({
        type: "editor/data/sessions/feed",
        data: data as any,
        reset: true,
      });
    });

    toast.promise(feed, {
      loading: "Fetching sessions...",
      success: "Sessions fetched",
      error: "Failed to fetch sessions",
    });
  }, [dispatch, datagrid_table, datagrid_rows_per_page, fetchResponseSessions]);

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
        `/private/editor/connect/${state.form_id}/supabase/table/${state.connections.supabase.main_supabase_table_id}/query`,
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

export function XSupabaseMainTableFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const { datagrid_rows_per_page, datagrid_table_refresh_key } = state;

  const request = state.connections.supabase?.main_supabase_table_id
    ? `/private/editor/connect/${state.form_id}/supabase/table/${state.connections.supabase.main_supabase_table_id}/query?limit=${datagrid_rows_per_page}` +
      // refresh when fields are updated
      "&r=" +
      datagrid_table_refresh_key
    : null;

  const res = useSWR<EditorApiResponse<GridaSupabase.XDataRow[], any>>(
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
    dispatch({
      type: "editor/data-grid/loading",
      isloading: res.isLoading || res.isValidating,
    });
  }, [dispatch, res.isLoading, res.isValidating]);

  useEffect(() => {
    // trigger data refresh
    dispatch({
      type: "editor/data-grid/refresh",
    });
  }, [dispatch, state.fields]);

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
