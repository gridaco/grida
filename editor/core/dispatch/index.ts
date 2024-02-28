import { Action, HistoryAction } from "../actions";
import { createContext, useCallback, useContext } from "react";

export type Dispatcher = (action: HistoryAction) => void;

export type FlatDispatcher = (action: HistoryAction) => void;

const __noop = () => {};

export const DispatchContext = createContext<Dispatcher>(__noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: HistoryAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};
