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
import colors, {
  neutral_colors,
  randomcolorname,
  type ColorPalette,
} from "@/k/tailwindcolors";

export type IMultiplayerCursorPresence = {
  cursor_id: string;
  user_id: string;
};

export type IMultiplayerCursorNotify = {
  cursor_id: string;
  message: string | undefined;
  location: string | undefined;
  node: NodePos | undefined;
  pos: ICursorPos | undefined;
};

export type IMultiplayerCursor = {
  cursor_id: string;
  user_id: string;

  message: string | undefined;
  // avatar: string;
  palette: ColorPalette;
  location: string | undefined;
  // canvas: "canvas" | "table";
  node: NodePos | undefined;
  // anchor: "screen" | "node" | "canvas";
  // origin: "center" | "top-left";
};

export type MultiplayerUserProfile = {
  uid: string;
  display_name: string;
  avatar: string | undefined;
};

export interface IMultiplayerState {
  room_id: string;
  presence_notify_key: number;
  cursors: Array<IMultiplayerCursor>;
  cursors_pos: Record<string, ICursorPos | undefined>;
  player: IMultiplayerCursor & {
    typing: boolean;
  };
  player_pos: ICursorPos | undefined;
  profiles: Record<string, MultiplayerUserProfile | undefined>;
}

type MultiplayerAction =
  | MultiplayerResolveProfileAction
  | MultiplayerLocalPlayerAction
  | MultiplayerLocalPlayerPosAction
  | MultiplayerPresenceSyncAction
  | MultiplayerPresenceNotifyAction
  | MultiplayerPresenceJoinAction
  | MultiplayerPresenceLeaveAction
  | MultiplayerCursorPosAction
  | MultiplayerCursorLocationAction
  | MultiplayerCursorMessageAction
  | MultiplayerCursorNodeAction;

type MultiplayerResolveProfileAction = {
  type: "multiplayer/profile/resolve";
  profile: MultiplayerUserProfile;
};

type MultiplayerLocalPlayerAction = {
  type: "multiplayer/player/local";
  update: Partial<IMultiplayerState["player"]>;
};

type MultiplayerLocalPlayerPosAction = {
  type: "multiplayer/player/local/pos";
  pos: ICursorPos | undefined;
};

type MultiplayerPresenceSyncAction = {
  type: "multiplayer/presence/sync";
  cursors: IMultiplayerCursorPresence[];
};

type MultiplayerPresenceNotifyAction = {
  type: "multiplayer/presence/notify";
  cursor: IMultiplayerCursorNotify;
};

type MultiplayerPresenceJoinAction = {
  type: "multiplayer/presence/join";
  /**
   * newly joined cursor ids
   */
  cursors: string[];
};

type MultiplayerPresenceLeaveAction = {
  type: "multiplayer/presence/leave";
  /**
   * left cursor ids
   */
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

function multiplayerReducer(
  state: IMultiplayerState,
  action: MultiplayerAction
): IMultiplayerState {
  switch (action.type) {
    case "multiplayer/profile/resolve": {
      const { profile } = action satisfies MultiplayerResolveProfileAction;
      return produce(state, (draft) => {
        draft.profiles[action.profile.uid] = {
          uid: profile.uid,
          avatar: profile.avatar,
          display_name: profile.display_name,
        };
      });
    }
    case "multiplayer/player/local": {
      const { update } = action satisfies MultiplayerLocalPlayerAction;
      return produce(state, (draft) => {
        draft.player = { ...draft.player, ...update };
      });
    }
    case "multiplayer/player/local/pos": {
      const { pos } = action satisfies MultiplayerLocalPlayerPosAction;
      return produce(state, (draft) => {
        draft.player_pos = pos;
      });
    }
    case "multiplayer/presence/sync": {
      const { cursors: presence_cursors } =
        action satisfies MultiplayerPresenceSyncAction;
      return produce(state, (draft) => {
        const other_cursor_ids = presence_cursors
          .map((c) => c.cursor_id)
          .filter((id) => id !== state.player.cursor_id);

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
            user_id: presence_cursors.find((c) => c.cursor_id === cursor_id)!
              .user_id,
            palette: colors[randomcolorname({ exclude: neutral_colors })],
            location: undefined,
            message: undefined,
            node: undefined,
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
    case "multiplayer/presence/notify": {
      const { cursor } = action satisfies MultiplayerPresenceNotifyAction;
      return produce(state, (draft) => {
        if (cursor.cursor_id === state.player.cursor_id) return;
        const existing_cursor = draft.cursors.find(
          (c) => c.cursor_id === cursor.cursor_id
        );
        if (existing_cursor) {
          // console.log("replace", cursor);
          existing_cursor.location = cursor.location;
          existing_cursor.message = cursor.message;
          existing_cursor.node = cursor.node;
          draft.cursors_pos[cursor.cursor_id] = cursor.pos;
        } else {
          console.error("cursor not found", cursor.cursor_id);
        }
      });
    }
    case "multiplayer/presence/join": {
      // when new cursor joins, notify player state
      const { cursors: __new_cursor_ids } =
        action satisfies MultiplayerPresenceJoinAction;

      if (state.cursors.length === 0) return state;

      const new_cursor_ids = __new_cursor_ids.filter(
        (id) => id !== state.player.cursor_id
      );

      if (new_cursor_ids.length === 0) return state;

      return produce(state, (draft) => {
        draft.presence_notify_key++;
      });
    }
    case "multiplayer/presence/leave": {
      // do nothing - this is also handled in sync
      break;
    }
    case "multiplayer/cursor/pos": {
      const { cursor_id, pos } = action satisfies MultiplayerCursorPosAction;
      return produce(state, (draft) => {
        draft.cursors_pos[cursor_id] = pos;
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
        cursor.message = message;
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
    (pos: ICursorPos | undefined) => {
      dispatch({
        type: "multiplayer/player/local/pos",
        pos,
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

  const onPlayerNode = useCallback(
    (node: ICursorNode | undefined) => {
      dispatch({
        type: "multiplayer/player/local",
        update: { node },
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
      onPlayerNode,
    }),
    [
      state.player,
      onPlayerPosition,
      onPlayerMessage,
      onPlayerTyping,
      onPlayerLocation,
      onPlayerNode,
    ]
  );
}

function initial_multiplayer_state(seed: {
  user_id: string;
  cursor_id: string;
  document_id: string;
}): IMultiplayerState {
  const local_color_name = randomcolorname({ exclude: neutral_colors });
  const local_player_cursor = {
    palette: colors[local_color_name],
    cursor_id: seed.cursor_id,
    user_id: seed.user_id,
    location: undefined,
    message: undefined,
    node: undefined,
  } satisfies IMultiplayerCursor;

  return {
    room_id: seed.document_id,
    presence_notify_key: 0,
    player: { ...local_player_cursor, typing: false },
    player_pos: undefined,
    cursors: [],
    cursors_pos: {},
    profiles: {},
  };
}
