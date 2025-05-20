import { FormAgentAction } from "./action";
import { createContext, useCallback, useContext } from "react";

export type Dispatcher = (action: FormAgentAction) => void;

export type FlatDispatcher = (action: FormAgentAction) => void;

const __noop = () => {};

export const DispatchContext = createContext<Dispatcher>(__noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: FormAgentAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};
