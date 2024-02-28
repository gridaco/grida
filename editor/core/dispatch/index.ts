import { Action, WorkspaceAction } from "../actions";
import { createContext, useCallback, useContext } from "react";

export type Dispatcher = (action: WorkspaceAction) => void;

export type FlatDispatcher = (action: WorkspaceAction) => void;

const __noop = () => {};

export const DispatchContext = createContext<Dispatcher>(__noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: WorkspaceAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};
