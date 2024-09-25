import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { Data } from "@/lib/data";
import type { DataQueryAction } from "./data-query.action";
import reducer from "./data-query.reducer";

export type DataGridQueryState = Data.Relation.QueryState;

type Dispatcher = (action: DataQueryAction) => void;

const StandaloneDataGridQueryContext = createContext<DataGridQueryState | null>(
  null
);

const __noop = () => {};

const StandaloneDataGridQueryDispatchContext =
  createContext<Dispatcher>(__noop);

const useDispatch = (): Dispatcher => {
  const dispatch = useContext(StandaloneDataGridQueryDispatchContext);
  return useCallback(
    (action: DataQueryAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};

export function StandaloneDataGridQueryProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: DataGridQueryState }>) {
  const [state, dispatch] = useReducer(reducer, initial);

  return (
    <StandaloneDataGridQueryContext.Provider value={state}>
      <StandaloneDataGridQueryDispatchContext.Provider
        value={dispatch ?? __noop}
      >
        {children}
      </StandaloneDataGridQueryDispatchContext.Provider>
    </StandaloneDataGridQueryContext.Provider>
  );
}

export function useStandaloneDataGridQuery() {
  const state = useContext(StandaloneDataGridQueryContext);
  if (!state) {
    throw new Error(
      "useStandaloneDataGridQuery must be used within a StandaloneDataGridQueryProvider"
    );
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch] as const, [state, dispatch]);
}
