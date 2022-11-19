import React, {
  createContext,
  useCallback,
  useContext,
  memo,
  ReactNode,
  useReducer,
  useMemo,
} from "react";
import type { DashboardState } from "./state";
import type { Action } from "./action";
import { reducer } from "./reducer";
import { initialDashboardState } from "./initial";
import { FigmaReflectRepository } from "editor/core/states";

const __noop = () => {};

type Dispatcher = (action: Action) => void;

const DispatchContext = createContext<Dispatcher>(__noop);

const useDispatch = (): Dispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: Action) => {
      dispatch(action);
    },
    [dispatch]
  );
};

const StateContext = createContext<DashboardState | undefined>(undefined);

export const DashboardStateProvider = function Awaiter({
  children,
  design,
}: React.PropsWithChildren<{ design?: FigmaReflectRepository }>) {
  if (!design) {
    return <>{children}</>;
  }

  return <Provider design={design}>{children}</Provider>;
};

const Provider = memo(function StateProvider({
  children,
  design,
}: React.PropsWithChildren<{
  design: FigmaReflectRepository;
}>) {
  const [value, dispatch] = useReducer(
    reducer,
    design ? initialDashboardState(design) : undefined
  );

  return (
    <StateContext.Provider value={value}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
});

export function useDashboardState(): [DashboardState, Dispatcher] {
  const state = useContext(StateContext);
  const dispatch = useDispatch();
  return useMemo(() => [state, dispatch], [state, dispatch]);
}

export function useDashboard() {
  const [state, dispatch] = useDashboardState();
  return { ...state, dispatch };
}
