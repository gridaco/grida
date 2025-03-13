import { useEffect } from "react";
import type {
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

export const useTableSubscription = <
  SchemaName extends string & keyof Database = "public" extends keyof Database
    ? "public"
    : string & keyof Database,
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
  client: SupabaseClient<Database, SchemaName>;
  filter: TableSubscriptionFilter;
  onUpdate?: (data: RealtimeTableChangeData) => void;
  onInsert?: (data: RealtimeTableChangeData) => void;
  onDelete?: (data: RealtimeTableChangeData | {}) => void;
  enabled: boolean;
}) => {
  useEffect(
    () => {
      if (!enabled) return;

      const changes = client
        .channel(channel, {
          config: {
            private: true,
          },
        })
        .on(
          "postgres_changes",
          filter,
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled]
  );
};
