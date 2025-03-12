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

interface TableSpaceInstanceInit<T, ID = string | number, I = any>
  extends Pick<TableSpaceInstance<T>, "identifier" | "readonly" | "realtime"> {
  fetcher: (query: Data.Relation.QueryState) => Promise<DataResponse<T>>;
  insert?: (data: I) => Promise<DataResponse<T>>;
  update?: (id: ID, data: I) => Promise<DataResponse<T>>;
  delete?: (id: ID) => Promise<DataResponse<T>>;
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

  useEffect(() => {
    setLoading(true);
    init.fetcher(query).then(({ data, error, count }) => {
      setLoading(false);

      if (data) {
        setCount(count);
        setStream(data);
      }
    });
  }, [query]);

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
