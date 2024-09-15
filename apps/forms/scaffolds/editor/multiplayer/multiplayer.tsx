import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useEditorState } from "../use";
import type { IMultiplayerCursor } from "../state";
import { useThrottle } from "@uidotdev/usehooks";
import colors from "@/k/tailwindcolors";

const RT_THROTTLE_MS = 50;

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

type ColorName = keyof typeof colors;

function pickcolorname(): ColorName {
  const keys = Object.keys(colors);
  return keys[Math.floor(Math.random() * keys.length)] as ColorName;
}

function initcursor(seed: Partial<IMultiplayerCursor>): IMultiplayerCursor {
  const color = pickcolorname();

  return {
    color: color,
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

  const debouncedPos = useThrottle(pos, RT_THROTTLE_MS);

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
      setCursors((cursors) => {
        const cursor = cursors.find(
          (u) => u.cursor_id === payload.payload!.cursor_id
        );
        if (!cursor) {
          return [
            ...cursors,
            {
              ...initcursor({
                cursor_id: payload.payload!.cursor_id,
                x: payload.payload?.x,
                y: payload.payload?.y,
              }),
            },
          ];
        }

        return cursors.map((u) => {
          if (u.cursor_id === payload.payload?.cursor_id) {
            if (u.cursor_id === cursor_id) return u; // skip local cursor
            return {
              ...u,
              x: payload.payload?.x,
              y: payload.payload?.y,
            };
          }
          return u;
        });
      });
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
  }, [client, cursor_id, room_id]);

  // POS hook
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
  }, [cursor_id, debouncedPos, send]);

  // local cursor update (without throttle)
  useEffect(() => {
    if (!pos || pos[0] === undefined || pos[1] === undefined) return;
    setCursors((cursors) => {
      const me = cursors.find((u) => u.cursor_id === cursor_id);
      if (!me) {
        return cursors;
      }

      return cursors.map((u) => {
        if (u.cursor_id === cursor_id) {
          return {
            ...u,
            x: pos[0],
            y: pos[1],
          };
        }
        return u;
      });
    });
  }, [cursor_id, pos]);

  return cursors;
}

export function MultiplayerLayer() {
  const [state] = useEditorState();
  const { room_id, cursor_id } = state.multiplayer;

  useEffect(() => {
    const onkeydown = (e: KeyboardEvent) => {
      if (e.shiftKey) return;
      if (e.metaKey) return;
      if (e.key === "/") {
        console.log("enter");
      }
    };

    window.addEventListener("keydown", onkeydown);

    return () => {
      window.removeEventListener("keydown", onkeydown);
    };
  }, []);

  const players = useMultiplayerRoom({ room_id, cursor_id });

  return (
    <>
      {players.map((u) =>
        u.x && u.y ? (
          <Cursor
            local={cursor_id === u.cursor_id}
            key={u.cursor_id}
            color={u.color}
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
  local,
  color,
  typing,
  x,
  y,
  message,
  onMessageChange,
}: {
  local: boolean;
  typing?: boolean;
  color: ColorName;
  x: number;
  y: number;
  message?: string;
  onMessageChange?: (message: string) => void;
}) {
  const fill = colors[color][600];
  const hue = colors[color][400];

  return (
    <>
      {!local && (
        <svg
          width="18"
          height="24"
          viewBox="0 0 18 24"
          fill="none"
          className="absolute top-0 left-0 transform transition-transform duration-75 pointer-events-none"
          style={{
            color: fill,
            transform: `translateX(${x}px) translateY(${y}px)`,
            zIndex: 999,
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.717 2.22918L15.9831 15.8743C16.5994 16.5083 16.1503 17.5714 15.2661 17.5714H9.35976C8.59988 17.5714 7.86831 17.8598 7.3128 18.3783L2.68232 22.7C2.0431 23.2966 1 22.8434 1 21.969V2.92626C1 2.02855 2.09122 1.58553 2.717 2.22918Z"
            fill={fill}
            stroke={hue}
            strokeWidth="2"
          />
        </svg>
      )}
      {typing && (
        <CursorMessageBubble
          local={local}
          color={fill}
          hue={hue}
          x={x + 16}
          y={y + 16}
          message={message}
          onMessageChange={onMessageChange}
        />
      )}
    </>
  );
}

function CursorMessageBubble({
  local,
  x,
  y,
  color,
  hue,
  message,
  onMessageChange,
}: {
  local: boolean;
  color: string;
  hue: string;
  x: number;
  y: number;
  message?: string;
  onMessageChange?: (message: string) => void;
}) {
  return (
    <div
      data-local={local}
      className="absolute top-0 left-0 transform transition-transform duration-75 pointer-events-none data-[local='true']:duration-0"
      style={{
        transform: `translateX(${x}px) translateY(${y}px)`,
        zIndex: 999 - 1,
      }}
    >
      <div
        className="max-w-xs rounded-full h-10 w-40 overflow-hidden border-2"
        style={{ backgroundColor: color, borderColor: hue }}
      >
        <input
          readOnly={!local}
          value={message}
          onChange={(e) => onMessageChange?.(e.target.value)}
          className="px-4 w-full h-full bg-transparent text-white placeholder:text-white/50"
          placeholder="Say something"
        />
      </div>
    </div>
  );
}
