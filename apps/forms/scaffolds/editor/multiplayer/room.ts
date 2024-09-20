"use client";
import { useEffect, useMemo, useState } from "react";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import type {
  ICursorId,
  ICursorPos,
  ICursorWindowLocation,
  ICursorMessage,
  ICursorNode,
} from "./types";
import {
  IMultiplayerCursor,
  IMultiplayerCursorPresence,
  IMultiplayerCursorSync,
} from "./provider";

interface BroadcastPayload<T> {
  type: "broadcast";
  event: string;
  payload?: T;
}

export function useMultiplayerRoom({
  room_id,
  user_id,
  cursor_id,
  onLocation,
  onMessage,
  onNode,
  onPos,
  onPresenceSync,
  onJoin,
  onLeave,
  onNotify,
}: {
  room_id: string;
  user_id: string;
  cursor_id: string;
  onMessage: (cursor_id: string, message: string) => void;
  onLocation: (cursor_id: string, location: string) => void;
  onNode: (cursor_id: string, node: ICursorNode | undefined) => void;
  onPos: (cursor_id: string, pos: ICursorPos) => void;
  onPresenceSync: (cursors: IMultiplayerCursorPresence[]) => void;
  onJoin: (cursors: string[]) => void;
  onLeave: (cursors: string[]) => void;
  onNotify: (
    cursor_id: string,
    payload: Omit<IMultiplayerCursorSync, "cursor_id">
  ) => void;
}) {
  const client = useMemo(() => createClientWorkspaceClient(), []);

  const [broadcast, setBroadcast] = useState<
    | ((
        event: "LOCATION" | "POS" | "MESSAGE" | "NODE" | "NOTIFY",
        payload: any
      ) => void)
    | undefined
  >();

  useEffect(() => {
    const room = client.channel("rooms", {
      config: {
        presence: { key: room_id },
      },
    });

    room
      .on("presence", { event: "sync" }, () => {
        const state = room.presenceState<{
          cursor_id: string;
          user_id: string;
        }>();
        const cursors = state[room_id];
        if (!cursors) return;

        onPresenceSync(cursors);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        onJoin(newPresences.map((p) => p.cursor_id));
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        onLeave(leftPresences.map((p) => p.cursor_id));
      })
      .subscribe(async (status) => {
        // console.log("room status", status);
        if (status === "SUBSCRIBED") {
          const resp = await room.track({
            cursor_id: cursor_id,
            user_id: user_id,
          });
          if (resp === "ok") {
          } else {
            console.error("Failed to track cursor");
          }
        }
        //
      });

    const ch = client.channel(`messages:${room_id}`);

    ch.on(
      "broadcast",
      { event: "POS" },
      (payload: BroadcastPayload<ICursorId & ICursorPos>) => {
        if (!payload.payload) return;
        onPos?.(payload.payload.cursor_id, {
          x: payload.payload.x,
          y: payload.payload.y,
        });
      }
    );
    ch.on(
      "broadcast",
      { event: "LOCATION" },
      (payload: BroadcastPayload<ICursorId & ICursorWindowLocation>) => {
        if (!payload.payload) return;
        onLocation(payload.payload.cursor_id, payload.payload.location);
      }
    );
    ch.on(
      "broadcast",
      { event: "MESSAGE" },
      (payload: BroadcastPayload<ICursorId & ICursorMessage>) => {
        if (!payload.payload) return;
        onMessage(payload.payload.cursor_id, payload.payload.message);
      }
    );
    ch.on(
      "broadcast",
      { event: "NODE" },
      (payload: BroadcastPayload<ICursorId & ICursorNode>) => {
        if (!payload.payload) return;
        onNode(
          payload.payload.cursor_id,
          payload.payload?.pos
            ? {
                type: payload.payload.type,
                pos: payload.payload.pos,
              }
            : undefined
        );
      }
    );
    ch.on(
      "broadcast",
      { event: "NOTIFY" },
      (payload: BroadcastPayload<IMultiplayerCursor>) => {
        // console.log("event:notify", payload);
        if (!payload.payload) return;
        onNotify(payload.payload.cursor_id, payload.payload);
      }
    );
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setBroadcast(() => (event: string, payload: any) => {
          ch.send({
            type: "broadcast",
            event: event,
            payload: {
              cursor_id: cursor_id,
              ...payload,
            },
          });
        });
      }
    });

    return () => {
      room.unsubscribe();
      client.removeChannel(room);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    client,
    cursor_id,
    room_id,
    // onLocation,
    // onMessage,
    // onNode,
    // onPos,
    // onPresenceSync,
  ]);

  return { broadcast };
}
