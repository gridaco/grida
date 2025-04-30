import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { Data } from "@/lib/data";
import type { DataQueryAction } from "./data-query.action";
import type {
  DataQueryOrderbyAddDispatcher,
  DataQueryOrderbyRemoveAllDispatcher,
  DataQueryOrderbyRemoveDispatcher,
  DataQueryOrderbyUpdateDispatcher,
  DataQueryPaginationIndexDispatcher,
  DataQueryPaginationLimitDispatcher,
  DataQueryPaginationNextDispatcher,
  DataQueryPaginationPrevDispatcher,
  DataQueryPredicateAddDispatcher,
  DataQueryPredicateRemoveAllDispatcher,
  DataQueryPredicateRemoveDispatcher,
  DataQueryPredicateUpdateDispatcher,
  DataQueryTextSearchClearDispatcher,
  DataQueryTextSearchColumnSetDispatcher,
  DataQueryTextSearchQueryDispatcher,
  DataQueryTextSearchSetDispatcher,
  IDataQueryGlobalConsumer,
  IDataQueryOrderbyConsumer,
  IDataQueryPaginationConsumer,
  IDataQueryPredicatesConsumer,
  IDataQueryTextSearchConsumer,
} from "./data-query.type";
import reducer from "./data-query.reducer";

export type DataQueryState = Data.Relation.QueryState;

type Dispatcher = (action: DataQueryAction) => void;

const StandaloneDataQueryContext = createContext<DataQueryState | null>(null);

const __noop = () => {};

const StandaloneDataQueryDispatchContext = createContext<Dispatcher>(__noop);

const useDispatch = (): Dispatcher => {
  const dispatch = useContext(StandaloneDataQueryDispatchContext);
  return useCallback(
    (action: DataQueryAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};

export function StandaloneDataQueryProvider({
  initial = Data.Relation.INITIAL_QUERY_STATE,
  value,
  onChange,
  children,
}: React.PropsWithChildren<{
  initial?: DataQueryState;
  value?: DataQueryState;
  onChange?: (query: DataQueryState) => void;
}>) {
  const isControlled = value !== undefined && onChange !== undefined;

  const [internalState, dispatchInternal] = useReducer(reducer, initial);

  const state = isControlled ? value : internalState;

  const dispatch = useCallback(
    (action: any) => {
      const newState = reducer(state, action);
      if (isControlled) {
        onChange(newState);
      } else {
        dispatchInternal(action);
      }
    },
    [isControlled, state, onChange]
  );

  return (
    <StandaloneDataQueryContext.Provider value={state}>
      <StandaloneDataQueryDispatchContext.Provider value={dispatch ?? __noop}>
        {children}
      </StandaloneDataQueryDispatchContext.Provider>
    </StandaloneDataQueryContext.Provider>
  );
}

export function useStandaloneDataQuery() {
  const state = useContext(StandaloneDataQueryContext);
  if (!state) {
    throw new Error(
      "useStandaloneDataQuery must be used within a StandaloneDataQueryProvider"
    );
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch] as const, [state, dispatch]);
}

//
// #region with schema
//

export type SchemaDataQueryConsumerReturnType = DataQueryState &
  IDataQueryGlobalConsumer &
  IDataQueryOrderbyConsumer &
  IDataQueryPredicatesConsumer &
  IDataQueryPaginationConsumer &
  IDataQueryTextSearchConsumer;

export function useStandaloneSchemaDataQuery({
  estimated_count,
}: {
  estimated_count: number | null;
}): SchemaDataQueryConsumerReturnType {
  const standalone = useStandaloneDataQuery();
  return useStandaloneSchemaDataQueryConsumer(standalone, {
    estimated_count,
  });
}

export function useStandaloneSchemaDataQueryConsumer(
  [state, dispatch]: readonly [DataQueryState, Dispatcher],
  {
    estimated_count,
  }: {
    estimated_count: number | null;
  }
): SchemaDataQueryConsumerReturnType {
  const { q_page_index, q_page_limit, q_orderby, q_predicates } = state;

  // #region global
  const onRefresh = useCallback(() => {
    dispatch({ type: "data/query/refresh" });
  }, [dispatch]);
  // #endregion global

  // #region pagination

  const minPage = 0;
  const maxPage = Math.ceil((estimated_count ?? 0) / q_page_limit) - 1;

  const hasPrevPage = q_page_index > minPage;
  const hasNextPage = q_page_index < maxPage;

  const onLimit: DataQueryPaginationLimitDispatcher = useCallback(
    (limit: number) => {
      dispatch({ type: "data/query/page-limit", limit });
    },
    [dispatch]
  );

  const onPaginate: DataQueryPaginationIndexDispatcher = useCallback(
    (index: number) => {
      dispatch({ type: "data/query/page-index", index });
    },
    [dispatch]
  );

  const onPrevPage: DataQueryPaginationPrevDispatcher = useCallback(() => {
    onPaginate(q_page_index - 1);
  }, [q_page_index, onPaginate]);

  const onNextPage: DataQueryPaginationNextDispatcher = useCallback(() => {
    onPaginate(q_page_index + 1);
  }, [q_page_index, onPaginate]);

  // #region pagination

  // #region orderby
  const isOrderbySet = Object.keys(q_orderby).length > 0;
  const orderbyUsedKeys = Object.keys(q_orderby);

  const onOrderbyAdd: DataQueryOrderbyAddDispatcher = useCallback(
    (
      column_id: string,
      initial?: Partial<Omit<Data.Query.OrderBy.SQLOrderBy, "column">>
    ) => {
      dispatch({
        type: "data/query/orderby",
        column_id: column_id,
        data: initial ?? {},
      });
    },
    [dispatch]
  );

  const onOrderbyUpdate: DataQueryOrderbyUpdateDispatcher = useCallback(
    (
      column_id: string,
      data: Partial<Omit<Data.Query.OrderBy.SQLOrderBy, "column">>
    ) => {
      dispatch({
        type: "data/query/orderby",
        column_id: column_id,
        data: data,
      });
    },
    [dispatch]
  );

  const onOrderbyRemove: DataQueryOrderbyRemoveDispatcher = useCallback(
    (column_id: string) => {
      dispatch({
        type: "data/query/orderby/remove",
        column_id: column_id,
      });
    },
    [dispatch]
  );

  const onOrderbyClear: DataQueryOrderbyRemoveAllDispatcher =
    useCallback(() => {
      dispatch({ type: "data/query/orderby/clear" });
    }, [dispatch]);

  // #endregion orderby

  // #region predicates

  const isPredicatesSet = q_predicates.length > 0;

  const onPredicatesAdd: DataQueryPredicateAddDispatcher = useCallback(
    (predicate: Data.Query.Predicate.ExtendedPredicate) => {
      dispatch({
        type: "data/query/predicates/add",
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const onPredicatesUpdate: DataQueryPredicateUpdateDispatcher = useCallback(
    (
      index: number,
      predicate: Partial<Data.Query.Predicate.ExtendedPredicate>
    ) => {
      dispatch({
        type: "data/query/predicates/update",
        index: index,
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const onPredicatesRemove: DataQueryPredicateRemoveDispatcher = useCallback(
    (index: number) => {
      dispatch({
        type: "data/query/predicates/remove",
        index: index,
      });
    },
    [dispatch]
  );

  const onPredicatesClear: DataQueryPredicateRemoveAllDispatcher =
    useCallback(() => {
      dispatch({
        type: "data/query/predicates/clear",
      });
    }, [dispatch]);
  // #endregion

  // #region text search
  const onTextSearch: DataQueryTextSearchSetDispatcher = useCallback(
    (
      column: string | null,
      query: string,
      config?: { type: Data.Query.Predicate.TextSearchQuery["type"] }
    ) => {
      dispatch({
        type: "data/query/textsearch",
        column,
        query,
        config,
      });
    },
    [dispatch]
  );

  const onTextSearchColumn: DataQueryTextSearchColumnSetDispatcher =
    useCallback(
      (column: string | null) => {
        dispatch({
          type: "data/query/textsearch/column",
          column: column,
        });
      },
      [dispatch]
    );
  const onTextSearchQuery: DataQueryTextSearchQueryDispatcher = useCallback(
    (query: string) => {
      dispatch({
        type: "data/query/textsearch/query",
        query: query,
      });
    },
    [dispatch]
  );
  const onTextSearchClear: DataQueryTextSearchClearDispatcher =
    useCallback(() => {
      dispatch({
        type: "data/query/textsearch/clear",
      });
    }, [dispatch]);

  const isTextSearchSet = !!state.q_text_search;
  const isTextSearchValid = !!state.q_text_search?.query;

  // #endregion

  return useMemo(
    () => ({
      ...state,
      //
      onRefresh,
      //
      limit: q_page_limit,
      page: q_page_index,
      minPage,
      maxPage,
      hasPrevPage,
      hasNextPage,
      onPaginate,
      onPrevPage,
      onNextPage,
      onLimit,
      //
      orderby: q_orderby,
      isOrderbySet,
      onOrderbyAdd,
      onOrderbyUpdate,
      onOrderbyRemove,
      onOrderbyClear,
      orderbyUsedKeys,
      //
      predicates: q_predicates,
      isPredicatesSet,
      onPredicatesAdd,
      onPredicatesUpdate,
      onPredicatesRemove,
      onPredicatesClear,
      //
      isTextSearchSet,
      isTextSearchValid,
      onTextSearch,
      onTextSearchColumn,
      onTextSearchQuery,
      onTextSearchClear,
    }),
    [
      state,
      //
      onRefresh,
      //
      q_page_limit,
      q_page_index,
      minPage,
      maxPage,
      hasPrevPage,
      hasNextPage,
      onPaginate,
      onPrevPage,
      onNextPage,
      onLimit,
      //
      q_orderby,
      isOrderbySet,
      onOrderbyAdd,
      onOrderbyUpdate,
      onOrderbyRemove,
      onOrderbyClear,
      orderbyUsedKeys,
      //
      q_predicates,
      isPredicatesSet,
      onPredicatesAdd,
      onPredicatesUpdate,
      onPredicatesRemove,
      onPredicatesClear,
      //
      isTextSearchSet,
      isTextSearchValid,
      onTextSearch,
      onTextSearchColumn,
      onTextSearchQuery,
      onTextSearchClear,
    ]
  );
  //
}

// #endregion with schema
