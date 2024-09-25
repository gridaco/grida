import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { Data } from "@/lib/data";
import type { DataQueryAction } from "./data-query.action";
import type { SQLOrderBy, SQLPredicate } from "@/types";
import type {
  DataQueryOrderbyAddDispatcher,
  DataQueryOrderbyRemoveAllDispatcher,
  DataQueryOrderbyRemoveDispatcher,
  DataQueryOrderbyUpdateDispatcher,
  DataQueryPaginationLimitDispatcher,
  DataQueryPredicateAddDispatcher,
  DataQueryPredicateRemoveAllDispatcher,
  DataQueryPredicateRemoveDispatcher,
  DataQueryPredicateUpdateDispatcher,
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
  children,
}: React.PropsWithChildren<{
  initial?: DataQueryState;
  onChange?: (query: DataQueryState) => void;
}>) {
  const [state, dispatch] = useReducer(reducer, initial);

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

export function useStandaloneSchemaDataQuery(
  schema: Data.Relation.Schema | null
) {
  const standalone = useStandaloneDataQuery();
  return useStandaloneSchemaDataQueryConsumer(standalone, schema);
}

export function useStandaloneSchemaDataQueryConsumer(
  [state, dispatch]: readonly [DataQueryState, Dispatcher],
  schema: Data.Relation.Schema | null
) {
  // const orderby = useDataQueryOrderbyConsumer(standalone, schema);
  // const predicates = useDataQueryPredicatesConsumer(standalone, schema);
  const properties = schema?.properties || {};

  const keys = Object.keys(properties);

  const onLimit: DataQueryPaginationLimitDispatcher = useCallback(
    (limit: number) => {
      dispatch({ type: "data/query/page-limit", limit });
    },
    [dispatch]
  );

  const { q_orderby, q_predicates } = state;

  // #region orderby
  const isOrderbySet = Object.keys(q_orderby).length > 0;
  const orderbyUsedKeys = Object.keys(q_orderby);

  const orderbyUnusedKeys = keys.filter(
    (key) => !orderbyUsedKeys.includes(key)
  );

  const onOrderbyAdd: DataQueryOrderbyAddDispatcher = useCallback(
    (column_id: string, initial?: Partial<Omit<SQLOrderBy, "column">>) => {
      dispatch({
        type: "data/query/orderby",
        column_id: column_id,
        data: initial ?? {},
      });
    },
    [dispatch]
  );

  const onOrderbyUpdate: DataQueryOrderbyUpdateDispatcher = useCallback(
    (column_id: string, data: Partial<Omit<SQLOrderBy, "column">>) => {
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
    (predicate: SQLPredicate) => {
      dispatch({
        type: "data/query/predicates/add",
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const onPredicatesUpdate: DataQueryPredicateUpdateDispatcher = useCallback(
    (index: number, predicate: Partial<SQLPredicate>) => {
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

  return useMemo(
    () => ({
      ...state,
      properties,
      keys,
      onLimit,
      //
      orderby: q_orderby,
      isOrderbySet,
      onOrderbyAdd,
      onOrderbyUpdate,
      onOrderbyRemove,
      onOrderbyClear,
      orderbyUnusedKeys,
      orderbyUsedKeys,
      //
      predicates: q_predicates,
      isPredicatesSet,
      onPredicatesAdd,
      onPredicatesUpdate,
      onPredicatesRemove,
      onPredicatesClear,
      //
    }),
    [
      state,
      properties,
      keys,
      //
      onLimit,
      //
      q_orderby,
      isOrderbySet,
      onOrderbyAdd,
      onOrderbyUpdate,
      onOrderbyRemove,
      onOrderbyClear,
      orderbyUnusedKeys,
      orderbyUsedKeys,
      //
      q_predicates,
      isPredicatesSet,
      onPredicatesAdd,
      onPredicatesUpdate,
      onPredicatesRemove,
      onPredicatesClear,
      //
    ]
  );
  //
}

// #endregion with schema
