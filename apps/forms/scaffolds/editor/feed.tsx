import React, { useCallback, useEffect, useMemo } from "react";
import { useEditorState } from "./provider";
import toast from "react-hot-toast";
import { createClientFormsClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    if (!realtime_responses_enabled) return;

    const changes = supabase
      .channel("table-filter-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "grida_forms",
          table: "response",
          filter: `form_id=eq.${form_id}`,
        },
        (payload) => {
          const { old, new: _new } = payload;

          // if deleted, the `new` is empty object `{}`
          const new_id: string | undefined = (_new as { id: string }).id;

          if (new_id) {
            // fetch the response in detail (delay is required for nested fields to be available)
            setTimeout(() => {
              const newresponse = fetchResponse(
                (_new as { id: string }).id
              ).then((data) => {
                console.log("new response", data);
                dispatch({
                  type: "editor/response/feed",
                  data: [data as any],
                });
              });

              toast.promise(
                newresponse,
                {
                  loading: "Fetching new response...",
                  success: "New response",
                  error: "Failed to fetch new response",
                },
                { id: new_id }
              );
            }, 1000);
          } else {
            // deleted
            dispatch({
              type: "editor/response/delete",
              id: (old as { id: string }).id,
            });
          }
        }
      )
      .subscribe();

    return () => {
      changes.unsubscribe();
    };
  }, [dispatch, fetchResponse, form_id, supabase, realtime_responses_enabled]);

  return <>{children}</>;
}

export function ResponseSessionFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const { form_id, datagrid_table, datagrid_rows, realtime_sessions_enabled } =
    state;

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

  return <>{children}</>;
}
