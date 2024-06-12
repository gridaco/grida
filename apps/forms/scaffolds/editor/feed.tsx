"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { useEditorState } from "./provider";
import toast from "react-hot-toast";
import { createClientFormsClient } from "@/lib/supabase/client";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type RealtimeTableChangeData = {
  id: string;
  [key: string]: any;
};

export const useSubscription = ({
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

    const changes = supabase
      .channel("table-filter-changes")
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
