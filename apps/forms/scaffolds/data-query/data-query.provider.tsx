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
  initial,
  children,
}: React.PropsWithChildren<{ initial: DataQueryState }>) {
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
  const [state, dispatch] = standalone;
  const orderby = useDataQueryOrderbyConsumer(standalone, schema);
  const predicates = useDataQueryPredicatesConsumer(standalone, schema);

  const onLimit: DataQueryPaginationLimitDispatcher = useCallback(
    (limit: number) => {
      dispatch({ type: "data/query/page-limit", limit });
    },
    [dispatch]
  );

  return useMemo(
    () => ({
      ...state,
      onLimit,
      isset: orderby.isset || predicates.isset,
      orderby,
      predicates,
    }),
    [onLimit, orderby, predicates, state]
  );
  //
}

export function useDataQueryOrderbyConsumer(
  [state, dispatch]: readonly [DataQueryState, Dispatcher],
  schema: Data.Relation.Schema | null
) {
  const { q_orderby } = state;

  const properties = schema?.properties || {};

  const isset = Object.keys(q_orderby).length > 0;

  const keys = Object.keys(properties);
  const usedkeys = Object.keys(q_orderby);
  const unusedkeys = keys.filter((key) => !usedkeys.includes(key));

  const onClear: DataQueryOrderbyRemoveAllDispatcher = useCallback(() => {
    dispatch({ type: "data/query/orderby/clear" });
  }, [dispatch]);

  const onAdd: DataQueryOrderbyAddDispatcher = useCallback(
    (column_id: string) => {
      dispatch({
        type: "data/query/orderby",
        column_id: column_id,
        data: {},
      });
    },
    [dispatch]
  );

  const onUpdate: DataQueryOrderbyUpdateDispatcher = useCallback(
    (column_id: string, data: Partial<Omit<SQLOrderBy, "column">>) => {
      dispatch({
        type: "data/query/orderby",
        column_id: column_id,
        data: data,
      });
    },
    [dispatch]
  );

  const onRemove: DataQueryOrderbyRemoveDispatcher = useCallback(
    (column_id: string) => {
      dispatch({
        type: "data/query/orderby",
        column_id: column_id,
        data: null,
      });
    },
    [dispatch]
  );

  return {
    orderby: q_orderby,
    isset,
    properties,
    usedkeys,
    unusedkeys,
    onClear,
    onAdd,
    onUpdate,
    onRemove,
  };
}

export function useDataQueryPredicatesConsumer(
  [state, dispatch]: readonly [DataQueryState, Dispatcher],
  schema: Data.Relation.Schema | null
) {
  const { q_predicates } = state;

  const properties = schema?.properties || {};

  const attributes = Object.keys(properties);

  const isset = q_predicates.length > 0;

  const onAdd: DataQueryPredicateAddDispatcher = useCallback(
    (predicate: SQLPredicate) => {
      dispatch({
        type: "data/query/predicates/add",
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const onUpdate: DataQueryPredicateUpdateDispatcher = useCallback(
    (index: number, predicate: Partial<SQLPredicate>) => {
      dispatch({
        type: "data/query/predicates/update",
        index: index,
        predicate: predicate,
      });
    },
    [dispatch]
  );

  const onRemove: DataQueryPredicateRemoveDispatcher = useCallback(
    (index: number) => {
      dispatch({
        type: "data/query/predicates/remove",
        index: index,
      });
    },
    [dispatch]
  );

  const onClear: DataQueryPredicateRemoveAllDispatcher = useCallback(() => {
    dispatch({
      type: "data/query/predicates/clear",
    });
  }, [dispatch]);

  return {
    isset,
    properties,
    attributes,
    predicates: q_predicates,
    onAdd: onAdd,
    onUpdate: onUpdate,
    onRemove: onRemove,
    onClear: onClear,
  };
}
// #endregion with schema
