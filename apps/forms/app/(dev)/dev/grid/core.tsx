import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
} from "react";
import produce from "immer";
import { State, initial } from "./core/state";
import { Action } from "./core/action";

const Context = React.createContext<State | undefined>(undefined);

type Dispatcher = (action: Action) => void;
type FlatDispatcher = (action: Action) => void;
const __noop = () => {};

const DispatchContext = createContext<Dispatcher>(__noop);

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ui/insert-panel/open": {
      return produce(state, (draft) => {
        draft.is_insert_panel_open = action.open;
      });
    }
    case "block/insert": {
      const { id, data } = action;
      return produce(state, (draft) => {
        draft.blocks[id] = data;
      });
    }
    case "block/delete": {
      const { id } = action;
      return produce(state, (draft) => {
        delete draft.blocks[id];
      });
    }
    case "block/tag": {
      const { id, tag } = action;
      return produce(state, (draft) => {
        draft.blocks[id].tag = tag;
      });
    }
    case "block/style": {
      console.log("block/style", action);
      const { id, style } = action;
      return produce(state, (draft) => {
        const block = draft.blocks[id];
        draft.blocks[id].style = {
          ...block.style,
          ...style,
        };
      });
    }
    case "block/media/src": {
      const { id, src } = action;
      return produce(state, (draft) => {
        draft.blocks[id].src = src;
      });
    }
    case "block/media/object-fit": {
      const { id, objectFit } = action;
      return produce(state, (draft) => {
        draft.blocks[id].objectFit = objectFit;
      });
    }
    case "block/text/data": {
      const { id, data } = action;
      return produce(state, (draft) => {
        draft.blocks[id].data = data;
      });
    }
  }
  return produce(state, (draft) => {});
}

export const useDispatch = (): FlatDispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: Action) => {
      dispatch(action);
    },
    [dispatch]
  );
};

const StateProvider = memo(function StateProvider({
  state,
  dispatch,
  children,
}: {
  state: State;
  dispatch?: Dispatcher;
  children?: React.ReactNode;
}) {
  return (
    <Context.Provider value={state}>
      <DispatchContext.Provider value={dispatch ?? __noop}>
        {children}
      </DispatchContext.Provider>
    </Context.Provider>
  );
});

export function Provider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = React.useReducer(reducer, initial);
  return (
    <StateProvider state={state} dispatch={dispatch}>
      {children}
    </StateProvider>
  );
}

export const useBuilderState = (): [State, FlatDispatcher] => {
  const state = useContext(Context);

  if (!state) {
    throw new Error(`No StateProvider: this is a logical error.`);
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch], [state, dispatch]);
};
