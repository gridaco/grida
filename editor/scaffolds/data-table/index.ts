import { Data } from "@/lib/data";
import { useEffect, useState } from "react";
import {
  type SchemaDataQueryConsumerReturnType,
  useStandaloneDataQuery,
  useStandaloneSchemaDataQueryConsumer,
} from "../data-query";

export interface DataGridLocalFilter {
  // localsearch?: string; // local search uses fuse.js to available data
  masking_enabled: boolean;
  empty_data_hidden: boolean;
}

interface TableSpaceInstance<T, K extends keyof T = keyof T> {
  identifier: K;
  readonly: boolean;
  loading: boolean;
  realtime: boolean;
  stream?: Array<T>;
  estimated_count: number | null;
  /**
   * TODO: NOT IMPLEMENTED
   */
  local_filter: DataGridLocalFilter | null;
}

type DataResponse<T> =
  | {
      data: Array<T>;
      error: null;
      count: number | null;
    }
  | {
      data: null;
      error: Error;
      count: null;
    };

type SubscriptionDisposer = () => void;

interface TableSpaceInstanceInit<T> extends Pick<
  TableSpaceInstance<T>,
  "identifier" | "readonly" | "realtime"
> {
  fetcher: (query: Data.Relation.QueryState) => Promise<DataResponse<T>>;
  subscriber?: (callbacks: {
    onInsert?: (data: T) => void;
    onUpdate?: (data: T) => void;
    onDelete?: (data: T | { [key: string]: any }) => void;
  }) => SubscriptionDisposer;
}

export function useTableSpaceInstance<T>(
  init: TableSpaceInstanceInit<T>
): TableSpaceInstance<T> & SchemaDataQueryConsumerReturnType {
  const [estimated_count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [stream, setStream] = useState<Array<T> | undefined>(undefined);
  const __sq = useStandaloneDataQuery();
  const [query] = __sq;
  const sqc = useStandaloneSchemaDataQueryConsumer(__sq, {
    estimated_count: estimated_count,
  });

  useEffect(
    () => {
      setLoading(true);
      init.fetcher(query).then(({ data, error, count }) => {
        setLoading(false);

        if (data) {
          setCount(count);
          setStream(data);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query]
  );

  useEffect(
    () => {
      if (!init.realtime) return;
      if (!init.subscriber) return;
      const disposable = init.subscriber({
        onInsert: (data) => {
          setStream((prev) => (prev ? [data, ...prev] : [data]));
        },
        onDelete: (data) => {
          setStream((prev) => {
            if (!prev) return prev;
            return prev.filter(
              (item) => item[init.identifier] !== (data as any)[init.identifier]
            );
          });
        },
        onUpdate: (data) => {
          setStream((prev) => {
            if (!prev) return prev;
            return prev.map((item) =>
              item[init.identifier] === data[init.identifier] ? data : item
            );
          });
        },
      });

      return () => {
        disposable();
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [init.realtime]
  );

  return {
    stream,
    loading,
    estimated_count,
    local_filter: null,
    identifier: init.identifier,
    readonly: init.readonly,
    realtime: init.realtime,
    ...sqc,
  };
}
