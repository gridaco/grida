import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useEffect, useId, useMemo, useState } from "react";
import { useEditorState } from "../use";
import type { IMultiplayerCursor } from "../state";
import { useDebounce, useThrottle } from "@uidotdev/usehooks";

export interface Payload<T> {
  type: "broadcast";
  event: string;
  payload?: T;
}

interface ICursorPos {
  cursor_id: string;
  x: number;
  y: number;
}

function initcursor(seed: Partial<IMultiplayerCursor>): IMultiplayerCursor {
  // const color = colors

  return {
    color: "",
    ...seed,
  } as IMultiplayerCursor;
}

function useMultiplayerRoom({
  room_id,
  cursor_id,
}: {
  room_id: string;
  cursor_id: string;
}) {
  const client = useMemo(() => createClientWorkspaceClient(), []);

  const [pos, setPos] = useState<[number, number]>();

  const debouncedPos = useThrottle(pos, 10);

  const [cursors, setCursors] = useState<IMultiplayerCursor[]>([]);

  const [send, setSend] = useState<
    ((payload: Payload<any>) => void) | undefined
  >();

  useEffect(() => {
    const room = client.channel("rooms", {
      config: {
        presence: { key: room_id },
      },
    });

    room.on("presence", { event: "sync" }, () => {
      const state = room.presenceState();
      const users = state[room_id];
      if (!users) return;

      console.log("users", users);
      //
    });

    room.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("subscribed");
      }
      //
    });

    const ch = client.channel(`messages:${room_id}`);

    ch.on("broadcast", { event: "POS" }, (payload: Payload<ICursorPos>) => {
      if (!payload.payload) return;
      setCursors((users) => {
        const user = users.find(
          (u) => u.cursor_id === payload.payload!.cursor_id
        );
        if (!user) {
          return [
            ...users,
            {
              cursor_id: payload.payload!.cursor_id,
              x: payload.payload?.x,
              y: payload.payload?.y,
            },
          ];
        }

        return users.map((u) => {
          if (u.cursor_id === payload.payload?.cursor_id) {
            return {
              ...u,
              x: payload.payload?.x,
              y: payload.payload?.y,
            };
          }
          return u;
        });
      });
      // if
    });
    ch.on("broadcast", { event: "NODE" }, (payload: Payload<any>) => {});
    ch.on("broadcast", { event: "LOCATION" }, (payload: Payload<any>) => {});
    ch.on("broadcast", { event: "MESSAGE" }, (payload: Payload<any>) => {});
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSend(() => (payload: Payload<any>) => {
          ch.send({
            type: payload.type,
            event: payload.event,
            payload: payload.payload,
          });
        });
      }
    });

    return () => {
      room.unsubscribe();
      client.removeChannel(room);
    };
  }, [client]);

  useEffect(() => {
    const onmousemove = (e: MouseEvent) => {
      setPos([e.clientX, e.clientY]);
    };

    window.addEventListener("mousemove", onmousemove);

    return () => {
      window.removeEventListener("mousemove", onmousemove);
    };
  }, []);

  useEffect(() => {
    if (!send) return;
    if (
      !debouncedPos ||
      debouncedPos[0] === undefined ||
      debouncedPos[1] === undefined
    )
      return;

    send({
      type: "broadcast",
      event: "POS",
      payload: { cursor_id: cursor_id, x: debouncedPos[0], y: debouncedPos[1] },
    });
  }, [send, debouncedPos?.[0], debouncedPos?.[1]]);

  return cursors;
}

export function MultiplayerLayer() {
  const [state] = useEditorState();
  const { room_id, cursor_id } = state.multiplayer;

  const players = useMultiplayerRoom({ room_id, cursor_id });

  return (
    <>
      {players.map((u) =>
        u.x && u.y ? (
          <Cursor
            key={u.cursor_id}
            color={"black"}
            hue={"black"}
            x={u.x}
            y={u.y}
          />
        ) : (
          <></>
        )
      )}
    </>
  );
}

function Cursor({
  color,
  hue,
  x,
  y,
}: {
  color: string;
  hue: string;
  x: number;
  y: number;
}) {
  return (
    <>
      <svg
        width="18"
        height="24"
        viewBox="0 0 18 24"
        fill="none"
        className="absolute top-0 left-0 transform transition pointer-events-none"
        style={{ color, transform: `translateX(${x}px) translateY(${y}px)` }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2.717 2.22918L15.9831 15.8743C16.5994 16.5083 16.1503 17.5714 15.2661 17.5714H9.35976C8.59988 17.5714 7.86831 17.8598 7.3128 18.3783L2.68232 22.7C2.0431 23.2966 1 22.8434 1 21.969V2.92626C1 2.02855 2.09122 1.58553 2.717 2.22918Z"
          fill={color}
          stroke={hue}
          strokeWidth="2"
        />
      </svg>
      <CursorMessageBubble />
    </>
  );
}

function CursorMessageBubble() {
  return <></>;
}
