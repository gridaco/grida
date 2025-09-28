"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
} from "react";
import { produce } from "immer";

export interface Player {
  id: string;
  name: string;
  color: {
    fill: string;
    hue: string;
  };
  message: string | null;
  position: {
    x: number;
    y: number;
  };
}

interface MultiplayerState {
  players: Player[];
}

type MultiplayerAction =
  | { type: "ADD_PLAYER"; payload: Omit<Player, "id"> }
  | {
      type: "UPDATE_PLAYER";
      payload: { id: string; updates: Partial<Omit<Player, "id">> };
    }
  | { type: "REMOVE_PLAYER"; payload: { id: string } }
  | {
      type: "UPDATE_PLAYER_MESSAGE";
      payload: { id: string; message: string | null };
    }
  | {
      type: "UPDATE_PLAYER_POSITION";
      payload: { id: string; position: { x: number; y: number } };
    };

const initialState: MultiplayerState = {
  players: [],
};

function multiplayerReducer(
  state: MultiplayerState,
  action: MultiplayerAction
): MultiplayerState {
  return produce(state, (draft) => {
    switch (action.type) {
      case "ADD_PLAYER": {
        const id = Math.random().toString(36).substr(2, 9);
        const newPlayer = { ...action.payload, id };
        draft.players.push(newPlayer);
        console.log(
          "Added player to store:",
          newPlayer.name,
          "Total players:",
          draft.players.length
        );
        break;
      }
      case "UPDATE_PLAYER": {
        const playerIndex = draft.players.findIndex(
          (p) => p.id === action.payload.id
        );
        if (playerIndex !== -1) {
          Object.assign(draft.players[playerIndex], action.payload.updates);
        }
        break;
      }
      case "REMOVE_PLAYER": {
        draft.players = draft.players.filter((p) => p.id !== action.payload.id);
        break;
      }
      case "UPDATE_PLAYER_MESSAGE": {
        const playerIndex = draft.players.findIndex(
          (p) => p.id === action.payload.id
        );
        if (playerIndex !== -1) {
          draft.players[playerIndex].message = action.payload.message;
          console.log(
            "Updated player message:",
            draft.players[playerIndex].name,
            "Message:",
            action.payload.message
          );
        }
        break;
      }
      case "UPDATE_PLAYER_POSITION": {
        const playerIndex = draft.players.findIndex(
          (p) => p.id === action.payload.id
        );
        if (playerIndex !== -1) {
          draft.players[playerIndex].position = action.payload.position;
        }
        break;
      }
    }
  });
}

interface MultiplayerContextValue {
  state: MultiplayerState;
  addPlayer: (player: Omit<Player, "id">) => void;
  updatePlayer: (id: string, updates: Partial<Omit<Player, "id">>) => void;
  removePlayer: (id: string) => void;
  updatePlayerMessage: (id: string, message: string | null) => void;
  updatePlayerPosition: (
    id: string,
    position: { x: number; y: number }
  ) => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(multiplayerReducer, initialState);

  const addPlayer = useCallback((player: Omit<Player, "id">) => {
    dispatch({ type: "ADD_PLAYER", payload: player });
  }, []);

  const updatePlayer = useCallback(
    (id: string, updates: Partial<Omit<Player, "id">>) => {
      dispatch({ type: "UPDATE_PLAYER", payload: { id, updates } });
    },
    []
  );

  const removePlayer = useCallback((id: string) => {
    dispatch({ type: "REMOVE_PLAYER", payload: { id } });
  }, []);

  const updatePlayerMessage = useCallback(
    (id: string, message: string | null) => {
      dispatch({ type: "UPDATE_PLAYER_MESSAGE", payload: { id, message } });
    },
    []
  );

  const updatePlayerPosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      dispatch({ type: "UPDATE_PLAYER_POSITION", payload: { id, position } });
    },
    []
  );

  const value: MultiplayerContextValue = {
    state,
    addPlayer,
    updatePlayer,
    removePlayer,
    updatePlayerMessage,
    updatePlayerPosition,
  };

  return React.createElement(MultiplayerContext.Provider, { value }, children);
}

export function useMultiplayerStore() {
  const context = useContext(MultiplayerContext);
  if (!context) {
    throw new Error(
      "useMultiplayerStore must be used within a MultiplayerProvider"
    );
  }
  return context;
}
