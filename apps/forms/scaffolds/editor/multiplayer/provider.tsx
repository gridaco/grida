import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import type {
  ICursorId,
  ICursorPos,
  ICursorWindowLocation,
  ICursorMessage,
  ICursorNode,
} from "./types";
import type { NodePos } from "../state";
import produce from "immer";
import colors, { randomcolorname } from "@/k/tailwindcolors";

export type IMultiplayerCursor = {
  cursor_id: string;
  // user_id: string;
  // username: string;

  message?: string;
  // avatar: string;
  color: keyof typeof colors;
  location: string | undefined;
  // canvas: "canvas" | "table";
  node?: NodePos;
  // anchor: "screen" | "node" | "canvas";
  // origin: "center" | "top-left";
  pos: ICursorPos | undefined;
};

export interface IMultiplayerState {
  room_id: string;
  cursors: Array<IMultiplayerCursor>;
  player: Omit<IMultiplayerCursor, "is_local"> & {
    typing: boolean;
  };
}

type MultiplayerAction =
  | MultiplayerLocalPlayerAction
  | MultiplayerPresenceSyncAction
  | MultiplayerCursorPosAction
  | MultiplayerCursorLocationAction
  | MultiplayerCursorMessageAction
  | MultiplayerCursorNodeAction;

type MultiplayerLocalPlayerAction = {
  type: "multiplayer/player/local";
  update: Partial<IMultiplayerState["player"]>;
};

type MultiplayerPresenceSyncAction = {
  type: "multiplayer/presence/sync";
  cursors: string[];
};

type MultiplayerCursorPosAction = {
  type: "multiplayer/cursor/pos";
  pos: ICursorPos;
} & ICursorId;

type MultiplayerCursorLocationAction = {
  type: "multiplayer/cursor/location";
} & ICursorId &
  ICursorWindowLocation;

type MultiplayerCursorMessageAction = {
  type: "multiplayer/cursor/message";
} & ICursorId &
  ICursorMessage;

type MultiplayerCursorNodeAction = {
  type: "multiplayer/cursor/node";
  node: ICursorNode | undefined;
} & ICursorId;

const Context = createContext<IMultiplayerState | null>(null);

type Dispatcher = (action: MultiplayerAction) => void;

const __noop = () => {};

const DispatchContext = createContext<Dispatcher>(__noop);

export function MultiplayerStateProvider({
  children,
  seed,
}: {
  children: React.ReactNode;
  seed: { user_id: string; cursor_id: string; document_id: string };
}) {
  const [state, dispatch] = useReducer(
    multiplayerReducer,
    seed,
    initial_multiplayer_state
  );

  return (
    <Context.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </Context.Provider>
  );
}

const useDispatch = (): Dispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: MultiplayerAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};

export function useMultiplayer() {
  const state = useContext(Context);

  if (!state) {
    throw new Error(
      "useMultiplayer must be used within a MultiplayerStateProvider"
    );
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch] as const, [state, dispatch]);
}

export function useLocalPlayer() {
  const [state, dispatch] = useMultiplayer();

  const onPlayerPosition = useCallback(
    (pos: ICursorPos) => {
      dispatch({
        type: "multiplayer/player/local",
        update: { pos },
      });
    },
    [dispatch]
  );

  const onPlayerMessage = useCallback(
    (message: string) => {
      dispatch({
        type: "multiplayer/player/local",
        update: { message },
      });
    },
    [dispatch]
  );

  const onPlayerTyping = useCallback(
    (typing: boolean) => {
      dispatch({
        type: "multiplayer/player/local",
        update: { typing },
      });
    },
    [dispatch]
  );

  const onPlayerLocation = useCallback(
    (location: string) => {
      dispatch({
        type: "multiplayer/player/local",
        update: { location },
      });
    },
    [dispatch]
  );

  return useMemo(
    () => ({
      ...state.player,
      onPlayerPosition,
      onPlayerMessage,
      onPlayerTyping,
      onPlayerLocation,
    }),
    [
      state.player,
      onPlayerPosition,
      onPlayerMessage,
      onPlayerTyping,
      onPlayerLocation,
    ]
  );
}

function multiplayerReducer(
  state: IMultiplayerState,
  action: MultiplayerAction
): IMultiplayerState {
  switch (action.type) {
    case "multiplayer/player/local": {
      const { update } = action satisfies MultiplayerLocalPlayerAction;
      return produce(state, (draft) => {
        draft.player = { ...draft.player, ...update };
      });
    }
    case "multiplayer/presence/sync": {
      const { cursors: presence_cursor_ids } =
        action satisfies MultiplayerPresenceSyncAction;
      return produce(state, (draft) => {
        const other_cursor_ids = presence_cursor_ids.filter(
          (id) => id !== state.player.cursor_id
        );

        // if new, initialize and add
        // if removed, remove

        const new_cursor_ids = other_cursor_ids.filter(
          (id) => !draft.cursors.some((c) => c.cursor_id === id)
        );

        const removed_cursor_ids = draft.cursors
          .map((c) => c.cursor_id)
          .filter((id) => !other_cursor_ids.includes(id));

        new_cursor_ids.forEach((cursor_id) => {
          draft.cursors.push({
            cursor_id,
            color: randomcolorname(),
            location: undefined,
            message: undefined,
            node: undefined,
            pos: undefined,
          });
        });

        removed_cursor_ids.forEach((cursor_id) => {
          const index = draft.cursors.findIndex(
            (c) => c.cursor_id === cursor_id
          );
          draft.cursors.splice(index, 1);
        });
      });
    }
    case "multiplayer/cursor/pos": {
      const { cursor_id, pos } = action satisfies MultiplayerCursorPosAction;
      return produce(state, (draft) => {
        const cursor = draft.cursors.find((c) => c.cursor_id === cursor_id);
        if (!cursor) return;
        cursor.pos = pos;
      });
    }
    case "multiplayer/cursor/location": {
      const { cursor_id, location } =
        action satisfies MultiplayerCursorLocationAction;
      return produce(state, (draft) => {
        const cursor = draft.cursors.find((c) => c.cursor_id === cursor_id);
        if (!cursor) return;
        cursor.location = location;
      });
    }
    case "multiplayer/cursor/message": {
      const { cursor_id, message } =
        action satisfies MultiplayerCursorMessageAction;
      return produce(state, (draft) => {
        const cursor = draft.cursors.find((c) => c.cursor_id === cursor_id);
        if (!cursor) return;
        cursor.message;
      });
    }
    case "multiplayer/cursor/node": {
      const { cursor_id, node } = action satisfies MultiplayerCursorNodeAction;
      return produce(state, (draft) => {
        const cursor = draft.cursors.find((c) => c.cursor_id === cursor_id);
        if (!cursor) return;
        cursor.node = node;
      });
    }
  }
  return state;
}

function initial_multiplayer_state(seed: {
  user_id: string;
  cursor_id: string;
  document_id: string;
}): IMultiplayerState {
  const local_color_name = randomcolorname();
  const local_player_cursor = {
    color: local_color_name,
    cursor_id: seed.cursor_id,
    location: undefined,
    message: undefined,
    node: undefined,
    pos: undefined,
  } satisfies IMultiplayerCursor;

  return {
    room_id: seed.document_id,
    player: { ...local_player_cursor, typing: false },
    cursors: [],
  };
}
