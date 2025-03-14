import { useEffect } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesFilter,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/database.types";

type RealtimeTableChangeData = {
  id: string;
  [key: string]: any;
};

type TableSubscriptionFilter = RealtimePostgresChangesFilter<"*">;

export function subscribeTable<
  _Database = Database,
  SchemaName extends string & keyof _Database = "public" extends keyof _Database
    ? "public"
    : string & keyof _Database,
>(
  client: SupabaseClient<_Database, SchemaName>,
  channel: string,
  filter: TableSubscriptionFilter,
  callbacks: {
    onUpdate?: (data: RealtimeTableChangeData) => void;
    onInsert?: (data: RealtimeTableChangeData) => void;
    onDelete?: (data: RealtimeTableChangeData | {}) => void;
  }
): RealtimeChannel {
  return client
    .channel(channel)
    .on(
      "postgres_changes",
      filter,
      async (
        payload: RealtimePostgresChangesPayload<RealtimeTableChangeData>
      ) => {
        const { old, new: _new, eventType } = payload;
        console.log("RealtimeTableChangeData", payload);
        switch (eventType) {
          case "INSERT": {
            callbacks.onInsert?.(_new);
            break;
          }
          case "UPDATE": {
            callbacks.onUpdate?.(_new);
            break;
          }
          case "DELETE":
            callbacks.onDelete?.(old);
            break;
        }
      }
    )
    .subscribe((status, err: any) => {
      if (err) console.error(err.message);
    });
}

export const useTableSubscription = <
  _Database = Database,
  SchemaName extends string & keyof _Database = "public" extends keyof _Database
    ? "public"
    : string & keyof _Database,
>({
  channel,
  client,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled,
}: {
  channel: string;
  client: SupabaseClient<_Database, SchemaName>;
  filter: TableSubscriptionFilter;
  onUpdate?: (data: RealtimeTableChangeData) => void;
  onInsert?: (data: RealtimeTableChangeData) => void;
  onDelete?: (data: RealtimeTableChangeData | {}) => void;
  enabled: boolean;
}) => {
  useEffect(
    () => {
      if (!enabled) return;

      const sub = subscribeTable(client, channel, filter, {
        onUpdate,
        onInsert,
        onDelete,
      });

      return () => {
        sub.unsubscribe();
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled]
  );
};
