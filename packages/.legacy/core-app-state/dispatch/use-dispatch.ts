import { useGlobalInputBlurTrigger } from "../global-input-blur";
import { Action } from "@core/state";
import { createContext, useCallback, useContext } from "react";
import { noop } from "../_utils";

export type Dispatcher = (action: Action) => void;

export type FlatDispatcher = (action: Action) => void;

export const DispatchContext = createContext<Dispatcher>(noop);

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);

  const blurTrigger = useGlobalInputBlurTrigger();

  // Simplify the dispatch function by flattening our action tuple
  return useCallback(
    (action: Action) => {
      // When changing selection, trigger any pending updates in input fields
      if (action.type === "select-page") {
        blurTrigger();
      }

      dispatch(action);
    },
    [dispatch, blurTrigger]
  );
};
