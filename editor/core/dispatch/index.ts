import { Action } from "../actions";
import { createContext, useCallback, useContext } from "react";

export type Dispatcher = (action: Action) => void;

export type FlatDispatcher = (action: Action) => void;

const __noop = () => {};

export const DispatchContext = createContext<Dispatcher>(__noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: Action) => {
      dispatch(action);
    },
    [dispatch]
  );
};
