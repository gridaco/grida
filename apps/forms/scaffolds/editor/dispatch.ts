import { BlocksEditorAction } from "./action";
import { createContext, useCallback, useContext } from "react";

export type Dispatcher = (action: BlocksEditorAction) => void;

export type FlatDispatcher = (action: BlocksEditorAction) => void;

const __noop = () => {};

export const DispatchContext = createContext<Dispatcher>(__noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: BlocksEditorAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};
