"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { useEditorState } from "./provider";
import toast from "react-hot-toast";
import { createClientFormsClient } from "@/lib/supabase/client";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import useSWR from "swr";
import type { EditorApiResponse } from "@/types/private/api";
import type {
  FormResponse,
  FormResponseField,
  FormResponseWithFields,
} from "@/types";
import { usePrevious } from "@uidotdev/usehooks";

type RealtimeTableChangeData = {
  id: string;
  [key: string]: any;
};

const useSubscription = ({
  table,
  form_id,
  onInsert,
  onDelete,
  enabled,
}: {
  table: "response" | "response_session";
  form_id: string;
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
          const new_id = (_new as RealtimeTableChangeData).id;

          if (new_id) {
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
  }, [supabase, form_id, table, enabled, onInsert, onDelete]);
};

export function ResponseSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  const supabase = useMemo(() => createClientFormsClient(), []);
  const prev = usePrevious(state.responses);

  const sync = useCallback(
    async (id: string, payload: { value: any; option_id?: string }) => {
      const { data, error } = await supabase
        .from("response_field")
        .update({
          // TODO:
          value: payload.value,
          form_field_option_id: payload.option_id,
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
            const _ = sync(cell.id, { value: cell.value });

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

  const { form_id, datagrid_table, datagrid_rows, realtime_responses_enabled } =
    state;

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
    const feed = fetchResponses(datagrid_rows).then((data) => {
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
  }, [dispatch, fetchResponses, datagrid_rows, datagrid_table]);

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
    datagrid_rows,
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

    const feed = fetchResponseSessions(datagrid_rows).then((data) => {
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
  }, [dispatch, datagrid_table, datagrid_rows, fetchResponseSessions]);

  useSubscription({
    table: "response_session",
    form_id,
    onInsert: (data) => {
      dispatch({
        type: "editor/data/sessions/feed",
        data: [data as any],
      });
    },
    enabled: realtime_sessions_enabled,
  });

  return <>{children}</>;
}

export function XSupabaseMainTableFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const request = state.connections.supabase?.main_supabase_table_id
    ? `/private/editor/connect/${state.form_id}/supabase/table/${state.connections.supabase.main_supabase_table_id}/query`
    : null;

  const res = useSWR<EditorApiResponse<Record<string, any>[], any>>(
    request,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  useEffect(() => {
    if (res.data?.data) {
      const rows = res.data.data;

      // TODO: process data to match the response interface
      const data = rows.map((row, i) => {
        return {
          id: row.id,
          local_id: null,
          local_index: 0,
          browser: null,
          created_at: new Date().toISOString(),
          customer_id: null,
          form_id: state.form_id,
          ip: null,
          platform_powered_by: null,
          raw: row,
          updated_at: new Date().toISOString(),
          x_referer: null,
          x_useragent: null,
          x_ipinfo: null,
          geo: null,
          fields: Object.keys(row).map((key) => {
            return {
              id: key,
              created_at: new Date().toISOString(),
              form_field_id: key,
              response_id: row.id,
              type: "text",
              updated_at: new Date().toISOString(),
              value: row[key],
              storage_object_paths: null,
            } satisfies FormResponseField;
          }),
        } satisfies FormResponseWithFields;
      });

      console.log("XSupabaseMainTableFeedProvider", data);

      dispatch({
        type: "editor/response/feed",
        data: data,
        reset: true,
      });
    }
  }, [dispatch, res.data, state.form_id]);

  return <>{children}</>;
}
