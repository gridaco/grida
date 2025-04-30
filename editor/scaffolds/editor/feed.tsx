"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDatagridTable, useEditorState, useFormFields } from "./use";
import toast from "react-hot-toast";
import useSWR from "swr";
import { createBrowserFormsClient } from "@/lib/supabase/client";
import type { FormResponse, FormResponseField, GridaXSupabase } from "@/types";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import { XPostgrestQuery } from "@/lib/supabase-postgrest/builder";
import equal from "deep-equal";
import { PrivateEditorApi } from "@/lib/private";
import { EditorSymbols } from "./symbols";
import {
  type GDocSchemaTableProviderGrida,
  type TablespaceSchemaTableStreamType,
  type TablespaceTransaction,
  type TVirtualRow,
} from "./state";
import PQueue from "p-queue";
import assert from "assert";
import type { Data } from "@/lib/data";
import { useCustomerFeed } from "@/scaffolds/platform/customer/use-customer-feed";
import { useTableSubscription } from "@/lib/supabase/realtime";
import type { Database } from "@/database.types";

type RealtimeTableChangeData = {
  id: string;
  [key: string]: any;
};

const useDebouncedDatagridQuery = (): Data.Relation.QueryState | null => {
  const [state] = useEditorState();
  const [q, setQ] = useState(state.datagrid_query);
  const { datagrid_query } = state;

  const debounced = useDebounce(datagrid_query, 500);

  useEffect(() => {
    setQ(debounced);
  }, [debounced]);

  useEffect(() => {
    setQ(datagrid_query);
  }, [datagrid_query?.q_refresh_key]);

  return q;
};

const useRefresh = () => {
  const [state, dispatch] = useEditorState();

  return useCallback(() => {
    dispatch({
      type: "data/query/refresh",
    });
  }, [dispatch]);
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
  const supabase = useMemo(() => createBrowserFormsClient(), []);

  useTableSubscription<Database, "grida_forms">({
    client: supabase,
    channel: `table-filter-changes-${table}-${form_id}`,
    enabled,
    filter: {
      event: "*",
      schema: "grida_forms",
      table: table,
      filter: `form_id=eq.${form_id}`,
    },
    onDelete,
    onUpdate,
    onInsert,
  });
};

function useFetchSchemaTableRows(table_id: string) {
  const supabase = useMemo(() => createBrowserFormsClient(), []);

  return useCallback(
    async ({ range }: { range: { from: number; to: number } }) => {
      // fetch the responses
      const { data, count, error } = await supabase
        .from("response")
        .select(
          `
            *,
            fields:response_field(*)
          `,
          {
            count: "estimated",
          }
        )
        .eq("form_id", table_id)
        .order("local_index")
        .range(range.from, range.to);

      if (error) {
        throw new Error();
      }

      return { data, error, count };
    },
    [supabase, table_id]
  );
}

function useFetchSchemaTableRow() {
  const supabase = useMemo(() => createBrowserFormsClient(), []);

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
  const supabase = useMemo(() => createBrowserFormsClient(), []);

  return useCallback(
    async ({ range }: { range: { from: number; to: number } }) => {
      // fetch the responses
      const { data, count, error } = await supabase
        .from("response_session")
        .select("*", { count: "estimated" })
        .eq("form_id", form_id)
        .order("created_at")
        .range(range.from, range.to);

      if (error) {
        throw new Error();
      }

      return { data, count };
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

function useUpdateCell() {
  const supabase = useMemo(() => createBrowserFormsClient(), []);

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
  const sync = useUpdateCell();

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

function useXSBTableFeed(
  {
    table_id,
    sb_table_id,
    onFeed,
  }: {
    table_id: string;
    sb_table_id?: number | null;
    onFeed?: (data: GridaXSupabase.XDataRow[], count: number) => void;
  },
  dpes?: React.DependencyList
) {
  const [state, dispatch] = useEditorState();
  const enabled = !!sb_table_id;

  const datagrid_query = useDebouncedDatagridQuery();

  const searchParams = useMemo(() => {
    if (!datagrid_query) return;
    return XPostgrestQuery.QS.fromQueryState(datagrid_query);
  }, [datagrid_query]);

  const request = sb_table_id
    ? PrivateEditorApi.XSupabase.url_table_x_query(
        table_id,
        sb_table_id,
        searchParams
      )
    : null;

  const res = useSWR<GridaXSupabase.XSBQueryResult>(
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

  const stableDeps = useMemo(() => dpes ?? [], [dpes]);

  useEffect(() => {
    if (!enabled) return;
    // trigger data refresh
    dispatch({
      type: "data/query/refresh",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, enabled, ...stableDeps]);

  useEffect(() => {
    if (!res.data) return;
    if (res.data.error) {
      toast.error("Failed to fetch data - see console for more details");
      console.error(res.data.error);
      return;
    }
    if (res.data?.data) {
      const rows = res.data.data;
      onFeed?.(rows, res.data.count!);
    } else {
      onFeed?.([], 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.data]);
}

function useXSBUpdateRow({
  schema_table_id,
  sb_table_id,
  pk,
}: {
  schema_table_id: string;
  sb_table_id?: number | null;
  pk: string | undefined;
}) {
  return useCallback(
    async (key: number | string, value: Record<string, any>) => {
      if (!sb_table_id) return;
      if (!pk) return;

      const res = await fetch(
        PrivateEditorApi.XSupabase.url_table_x_query(
          schema_table_id,
          sb_table_id
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
                column: pk,
                value: key,
              },
            ],
          } satisfies XPostgrestQuery.Body),
        }
      ).then((res) => res.json());

      const { data, error } = res;
      if (error) {
        console.error(error, {
          key,
          payload: value,
        });
        throw new Error();
      }

      return res;
    },
    [pk, schema_table_id, sb_table_id]
  );
}

const DB_TRANSACTIONS_RESOLVER_QUEUE = new PQueue({ concurrency: 1 });

function useResolveTransactions(
  transactions: Array<TablespaceTransaction>,
  {
    operators,
    onTransactionFinally,
    onTransactionQueued,
  }: {
    operators: {
      update: (key: string, data: Record<string, any>) => Promise<any>;
    };
    onTransactionFinally?: (digest: string) => void;
    onTransactionQueued?: (digest: string) => void;
  }
) {
  useEffect(() => {
    if (!transactions) return;
    const tobequeued = transactions.filter((t) => t.status === "pending");
    if (tobequeued.length === 0) return;

    for (const q of tobequeued) {
      const { row, column, data } = q;
      const fn = async () => {
        operators.update(row, data).finally(() => {
          onTransactionFinally?.(q.digest);
        });
      };
      DB_TRANSACTIONS_RESOLVER_QUEUE.add(fn);
      // mark as processing
      onTransactionQueued?.(q.digest);
    }
  }, [transactions, operators, onTransactionFinally, onTransactionQueued]);
}

export function FormResponseSyncProvider({
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

export function FormResponseFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const { form, datagrid_table_id, tablespace } = state;

  const datagrid_query = useDebouncedDatagridQuery();

  const { realtime: _realtime_responses_enabled } =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID];

  const setLoading = useChangeDatagridLoading();

  const fetchResponses = useFetchSchemaTableRows(form.form_id);

  const fetchResponse = useFetchSchemaTableRow();

  useEffect(() => {
    if (
      datagrid_table_id !==
      EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
    ) {
      return;
    }

    if (!datagrid_query) return;

    setLoading(true);
    fetchResponses({
      range: {
        from: datagrid_query.q_page_index * datagrid_query.q_page_limit,
        to: (datagrid_query.q_page_index + 1) * datagrid_query.q_page_limit - 1,
      },
    })
      .then(({ data, count }) => {
        dispatch({
          table_id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
          type: "editor/table/space/feed",
          count: count ?? 0,
          data: data as any,
          reset: true,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    dispatch,
    fetchResponses,
    setLoading,
    datagrid_query?.q_refresh_key,
    datagrid_query?.q_page_index,
    datagrid_query?.q_page_limit,
    datagrid_table_id,
  ]);

  useSubscription({
    table: "response",
    form_id: form.form_id,
    onInsert: (data) => {
      setTimeout(() => {
        const newresponse = fetchResponse((data as { id: string }).id).then(
          (data) => {
            dispatch({
              table_id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
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
          table_id: EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID,
          type: "editor/table/space/feed",
          data: [data as any],
        });
      });
    },
    onDelete: (data) => {
      if ("id" in data) {
        dispatch({
          type: "editor/table/space/rows/delete",
          id: data.id,
        });
      }
    },
    enabled: _realtime_responses_enabled,
  });

  return <>{children}</>;
}

export function FormResponseSessionFeedProvider({
  children,
  forceEnableRealtime,
}: React.PropsWithChildren<{
  forceEnableRealtime?: boolean;
}>) {
  const [state, dispatch] = useEditorState();

  const { form, datagrid_table_id, tablespace } = state;

  const datagrid_query = useDebouncedDatagridQuery();

  const { realtime: _realtime_sessions_enabled } =
    tablespace[EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID];

  const realtime_sessions_enabled =
    forceEnableRealtime ?? _realtime_sessions_enabled;

  const setLoading = useChangeDatagridLoading();

  const fetchResponseSessions = useFetchResponseSessions(form.form_id);

  useEffect(() => {
    if (
      datagrid_table_id !== EditorSymbols.Table.SYM_GRIDA_FORMS_SESSION_TABLE_ID
    ) {
      return;
    }

    if (!datagrid_query) return;

    setLoading(true);

    const feed = fetchResponseSessions({
      range: {
        from: datagrid_query.q_page_index * datagrid_query.q_page_limit,
        to: (datagrid_query.q_page_index + 1) * datagrid_query.q_page_limit - 1,
      },
    }).then(({ data, count }) => {
      dispatch({
        type: "editor/table/space/feed/sessions",
        data: data as any,
        reset: true,
        count: count!,
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
    datagrid_query,
  ]);

  useSubscription({
    table: "response_session",
    form_id: form.form_id,
    onInsert: (data) => {
      dispatch({
        type: "editor/table/space/feed/sessions",
        data: [data as any],
      });
    },
    onUpdate: (data) => {
      dispatch({
        type: "editor/table/space/feed/sessions",
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
  } = state;

  const datagrid_query = useDebouncedDatagridQuery();
  const setLoading = useChangeDatagridLoading();

  useCustomerFeed(
    project_id,
    {
      enabled:
        datagrid_table_id === EditorSymbols.Table.SYM_GRIDA_CUSTOMER_TABLE_ID,
      query: datagrid_query,
    },
    {
      onLoadingChange: setLoading,
      onFeed: (data) => {
        dispatch({
          type: "editor/customers/feed",
          data: data,
        });
      },
    }
  );

  return <>{children}</>;
}

export function XSBTableTransactionsQueueProvider({
  pk,
  schema_table_id,
  sb_table_id,
  children,
}: React.PropsWithChildren<{
  schema_table_id: string;
  sb_table_id: number;
  pk: string;
}>) {
  const [state, dispatch] = useEditorState();

  const { transactions: _transactions } = state;

  const target_transactions = useMemo(() => {
    return _transactions.filter((t) => t.schema_table_id === schema_table_id);
  }, [_transactions, schema_table_id]);

  const refresh = useRefresh();

  const update = useXSBUpdateRow({
    pk: pk,
    schema_table_id: schema_table_id,
    sb_table_id: sb_table_id,
  });

  const updateTransactionStatus = useCallback(
    (digest: string, status: "queued" | "resolved") => {
      dispatch({
        type: "editor/table/space/transactions/status",
        digest: digest,
        status: status,
      });
    },
    [dispatch]
  );

  useResolveTransactions(target_transactions, {
    operators: {
      update: (...args) => {
        const task = update(...args);
        toast.promise(task, {
          loading: "Updating...",
          success: "Updated",
          error: "Failed",
        });

        return task;
      },
    },
    onTransactionFinally: (digest: string) => {
      updateTransactionStatus(digest, "resolved");
      refresh();
    },
    onTransactionQueued: (digest: string) => {
      updateTransactionStatus(digest, "queued");
    },
  });

  return <>{children}</>;
}

export function FormXSupabaseMainTableFeedProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();
  const fields = useFormFields();

  useXSBTableFeed(
    {
      table_id: state.form.form_id,
      sb_table_id: state.connections.supabase?.main_supabase_table_id,
      onFeed: (rows, count) => {
        dispatch({
          type: "editor/table/space/feed/x-supabase",
          table_id:
            EditorSymbols.Table.SYM_GRIDA_FORMS_X_SUPABASE_MAIN_TABLE_ID,
          data: rows,
          count,
        });
      },
    },
    [fields]
  );

  return <>{children}</>;
}

export function GridaSchemaTableSyncProvider({
  table_id,
  children,
}: React.PropsWithChildren<{
  table_id: string;
}>) {
  const [state] = useEditorState();
  const { tablespace } = state;

  const tb = useDatagridTable();

  assert(tb?.provider === "grida", "Table provider is not grida");

  const stream = tablespace[table_id].stream as unknown as Array<
    TablespaceSchemaTableStreamType<GDocSchemaTableProviderGrida>
  >;

  const prev = usePrevious(stream);

  // FIXME:
  useSyncCellChangesEffect(prev, stream);

  return <>{children}</>;
}

export function GridaSchemaTableFeedProvider({
  table_id,
  children,
}: React.PropsWithChildren<{
  table_id: string;
}>) {
  const [state, dispatch] = useEditorState();

  const { tablespace } = state;

  const datagrid_query = useDebouncedDatagridQuery();

  const { realtime: _realtime_responses_enabled } = tablespace[table_id];

  const setLoading = useChangeDatagridLoading();

  const fetchTableRows = useFetchSchemaTableRows(table_id);

  const fetchTableRow = useFetchSchemaTableRow();

  useEffect(() => {
    if (typeof table_id !== "string") return;
    if (!datagrid_query) return;

    setLoading(true);
    const feed = fetchTableRows({
      range: {
        from: datagrid_query.q_page_index * datagrid_query.q_page_limit,
        to: (datagrid_query.q_page_index + 1) * datagrid_query.q_page_limit - 1,
      },
    }).then(({ data, count }) => {
      dispatch({
        type: "editor/table/space/feed",
        table_id: table_id,
        data: data as any,
        reset: true,
        count: count!,
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
  }, [dispatch, fetchTableRows, setLoading, table_id, datagrid_query]);

  useSubscription({
    table: "response",
    form_id: table_id,
    onInsert: (data) => {
      setTimeout(() => {
        const newresponse = fetchTableRow((data as { id: string }).id).then(
          (data) => {
            dispatch({
              table_id: table_id,
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
          table_id: table_id,
          type: "editor/table/space/feed",
          data: [data as any],
        });
      });
    },
    onDelete: (data) => {
      if ("id" in data) {
        dispatch({
          type: "editor/table/space/rows/delete",
          id: data.id,
        });
      }
    },
    enabled: _realtime_responses_enabled,
  });

  return <>{children}</>;
}

export function GridaSchemaXSBTableFeedProvider({
  table_id,
  sb_table_id,
}: {
  table_id: string;
  sb_table_id: number;
}) {
  const [state, dispatch] = useEditorState();

  useXSBTableFeed({
    table_id: table_id,
    sb_table_id: sb_table_id,
    onFeed: (rows, count) => {
      dispatch({
        type: "editor/table/space/feed/x-supabase",
        table_id: table_id,
        data: rows,
        count,
      });
    },
  });

  return <></>;
}
