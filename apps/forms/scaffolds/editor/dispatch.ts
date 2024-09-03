import { EditorAction } from "./action";
import { createContext, useCallback, useContext } from "react";

export type Dispatcher = (action: EditorAction) => void;

export type FlatDispatcher = (action: EditorAction) => void;

const __noop = () => {};

export const DispatchContext = createContext<Dispatcher>(__noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: EditorAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};
