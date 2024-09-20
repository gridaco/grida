"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorState } from "../use";
import { PointerCursor } from "./pointer";
import { useMouse, useThrottle } from "@uidotdev/usehooks";
import { usePathname } from "next/navigation";
import {
  IMultiplayerCursor,
  IMultiplayerCursorPresence,
  IMultiplayerCursorNotify,
  MultiplayerStateProvider,
  MultiplayerUserProfile,
  useLocalPlayer,
  useMultiplayer,
} from "./provider";
import { useMultiplayerRoom } from "./room";
import { ICursorPos, ICursorNode } from "./types";
import { createClientWorkspaceClient } from "@/lib/supabase/client";

const RT_THROTTLE_MS = 50;

export default function Multiplayer({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  return (
    <MultiplayerStateProvider
      seed={{
        document_id: state.document_id,
        user_id: state.user_id,
        cursor_id: state.cursor_id,
      }}
    >
      <MultiplayerLayer />
      {children}
    </MultiplayerStateProvider>
  );
}

function useFetchUserProfile() {
  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  return useCallback(
    async (uid: string) => {
      const { error, data } = await supabase
        .from("user_profile")
        .select("*")
        .eq("uid", uid)
        .single();

      if (data) {
        return {
          error,
          data: {
            uid: data.uid,
            display_name: data.display_name,
            avatar: data.avatar_path
              ? supabase.storage.from("avatars").getPublicUrl(data.avatar_path)
                  .data.publicUrl
              : undefined,
          },
        };
      }

      return {
        error,
        data,
      };
    },
    [supabase]
  );
}

function useProfilesResolver() {
  const [state, dispatch] = useMultiplayer();

  const onResolve = useCallback(
    (profile: MultiplayerUserProfile) => {
      dispatch({ type: "multiplayer/profile/resolve", profile });
    },
    [dispatch]
  );

  const fetch = useFetchUserProfile();

  const user_ids = [state.player.user_id].concat(
    state.cursors.map((c) => c.user_id)
  );

  const resolved_user_ids = Object.keys(state.profiles);

  const unresolved_user_ids = user_ids.filter(
    (uid) => !resolved_user_ids.includes(uid)
  );

  useEffect(() => {
    unresolved_user_ids.forEach((uid) => {
      fetch(uid).then(({ data }) => {
        if (data) {
          const profile: MultiplayerUserProfile = {
            uid: data.uid,
            display_name: data.display_name,
            avatar: data.avatar,
          };
          onResolve(profile);
        }
      });
    });
  }, [unresolved_user_ids, onResolve]);
}

function MultiplayerLayer() {
  useProfilesResolver();

  const [editor] = useEditorState();
  const location = usePathname();

  const [state, dispatch] = useMultiplayer();
  const {
    cursor_id,
    onPlayerPosition,
    onPlayerMessage,
    onPlayerTyping,
    onPlayerLocation,
    onPlayerNode,
  } = useLocalPlayer();
  const {
    room_id,
    player,
    player_pos,
    cursors,
    cursors_pos,
    presence_notify_key,
  } = state;

  const [mouse] = useMouse();

  const debouncedPos = useThrottle(player_pos, RT_THROTTLE_MS);

  const onLocation = useCallback(
    (cursor_id: string, location: string) => {
      dispatch({ type: "multiplayer/cursor/location", cursor_id, location });
    },
    [dispatch]
  );

  const onMessage = useCallback(
    (cursor_id: string, message: string) => {
      dispatch({ type: "multiplayer/cursor/message", cursor_id, message });
    },
    [dispatch]
  );

  const onNode = useCallback(
    (cursor_id: string, node: ICursorNode | undefined) => {
      dispatch({ type: "multiplayer/cursor/node", cursor_id, node });
    },
    [dispatch]
  );

  const onPos = useCallback(
    (cursor_id: string, pos: ICursorPos) => {
      dispatch({ type: "multiplayer/cursor/pos", cursor_id, pos });
    },
    [dispatch]
  );

  const onPresenceSync = useCallback(
    (cursors: IMultiplayerCursorPresence[]) => {
      dispatch({ type: "multiplayer/presence/sync", cursors });
    },
    [dispatch]
  );

  const onJoin = useCallback(
    (cursors: string[]) => {
      // console.log("join", cursors);
      dispatch({ type: "multiplayer/presence/join", cursors });
    },
    [dispatch]
  );
  const onLeave = useCallback(() => {}, []);

  const onNotify = useCallback(
    (
      cursor_id: string,
      payload: Omit<IMultiplayerCursorNotify, "cursor_id">
    ) => {
      dispatch({
        type: "multiplayer/presence/notify",
        cursor: { cursor_id, ...payload },
      });
    },
    [dispatch]
  );

  const { broadcast } = useMultiplayerRoom({
    room_id: room_id,
    cursor_id: player.cursor_id,
    user_id: player.user_id,
    onLocation: onLocation,
    onMessage: onMessage,
    onNode: onNode,
    onPos: onPos,
    onPresenceSync: onPresenceSync,
    onJoin,
    onLeave,
    onNotify,
  });

  useEffect(() => {
    const onkeydown = (e: KeyboardEvent) => {
      if (e.shiftKey) return;
      if (e.metaKey) return;
      if (e.key === "/") {
        onPlayerTyping(true);
        return;
      }

      if (e.key === "Escape") {
        onPlayerTyping(false);
        onPlayerMessage("");
        return;
      }
    };

    window.addEventListener("keydown", onkeydown);

    return () => {
      window.removeEventListener("keydown", onkeydown);
    };
  }, [onPlayerMessage, onPlayerTyping]);

  useEffect(() => {
    onPlayerPosition({ x: mouse.x, y: mouse.y });
  }, [mouse.x, mouse.y, onPlayerPosition]);

  useEffect(() => {
    onPlayerLocation(location);
    onPlayerNode(undefined);
  }, [location, onPlayerLocation]);

  useEffect(() => {
    if (!broadcast) return;
    broadcast("LOCATION", { location: player.location });
  }, [broadcast, player.location]);

  useEffect(() => {
    if (presence_notify_key === 0) return;
    if (!broadcast) return;
    const pl = {
      location: player.location,
      message: player.message,
      node: player.node,
      pos: player_pos,
    } satisfies Omit<IMultiplayerCursorNotify, "cursor_id">;
    broadcast("NOTIFY", pl);
    // console.log("broadcast", presence_notify_key, pl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presence_notify_key, broadcast]);

  useEffect(() => {
    if (!broadcast) return;
    if (
      !debouncedPos ||
      debouncedPos.x === undefined ||
      debouncedPos.y === undefined
    )
      return;

    broadcast("POS", { x: debouncedPos.x, y: debouncedPos.y });
  }, [debouncedPos, broadcast]);

  useEffect(() => {
    if (editor.datagrid_selected_cell) {
      onPlayerNode({
        type: "cell",
        pos: editor.datagrid_selected_cell,
      });
    }
  }, [editor.datagrid_selected_cell]);

  useEffect(() => {
    if (!broadcast) return;

    broadcast("NODE", player.node);
  }, [player.node, broadcast]);

  useEffect(() => {
    if (!broadcast) return;
    broadcast("MESSAGE", { message: player.message });
  }, [player.message, broadcast, player.typing]);

  const current_location_cursors = useMemo(() => {
    // TODO: inspect me!
    // return cursors;
    return cursors
      .filter((c) => c.location === player.location)
      .filter((c) => {
        if (c.node) {
          return c.node.type !== "cell";
        }
        return true;
      });
  }, [cursors, player.location]);

  // console.log("players", {
  //   cursors,
  //   current_location_cursors,
  //   player,
  // });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* {process.env.NODE_ENV === "development" && (
        <div className="absolute z-50 left-0 top-0 p-2 bg-black bg-opacity-50 text-white text-xs w-40 overflow-scroll">
          <pre>
            {JSON.stringify({ ...player, plalette: undefined }, null, 2)}
          </pre>
        </div>
      )} */}
      {player_pos && (
        <PointerCursor
          local
          message={player.message}
          onMessageChange={onPlayerMessage}
          typing={player.typing}
          x={player_pos.x}
          y={player_pos.y}
          color={{
            fill: player.palette[600],
            hue: player.palette[400],
          }}
          onMessageBlur={() => {
            onPlayerTyping(false);
            onPlayerMessage("");
          }}
        />
      )}
      {current_location_cursors.map((c) => {
        const pos = cursors_pos[c.cursor_id];
        if (!pos) return <></>;
        return (
          <PointerCursor
            local={false}
            message={c.message}
            key={c.cursor_id}
            color={{
              fill: c.palette[600],
              hue: c.palette[400],
            }}
            x={pos.x}
            y={pos.y}
          />
        );
      })}
    </div>
  );
}
