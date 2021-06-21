import { useGlobalInputBlurTrigger } from "../global-input-blur";
import { Action } from "@core/state";
import { createContext, useCallback, useContext } from "react";
import { noop } from "../_utils";

export type Dispatcher = (action: Action) => void;

export type FlatDispatcher = (...args: Action) => void;

export const DispatchContext = createContext<Dispatcher>(noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);

  const blurTrigger = useGlobalInputBlurTrigger();

  // Simplify the dispatch function by flattening our action tuple
  return useCallback(
    (...args: Action) => {
      // When changing selection, trigger any pending updates in input fields
      if (args[0] === "selectPage") {
        blurTrigger();
      }

      dispatch(args);
    },
    [dispatch, blurTrigger]
  );
};
