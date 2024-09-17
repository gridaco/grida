import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorState } from "../use";
import type { IMultiplayerCursor } from "../state";
import { useThrottle } from "@uidotdev/usehooks";
import colors from "@/k/tailwindcolors";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";

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

interface ILocation {
  cursor_id: string;
  location: string;
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

  const [cursors, setCursors] = useState<IMultiplayerCursor[]>([]);

  const [send, setSend] = useState<
    ((event: "LOCATION" | "POS" | "MESSAGE", payload: any) => void) | undefined
  >();

  const syncstate = useCallback(
    (cursor_id: string, payload: Partial<IMultiplayerCursor>) => {
      setCursors((cursors) => {
        const cursor = cursors.find((u) => u.cursor_id === cursor_id);
        if (!cursor) {
          return [
            ...cursors,
            {
              ...initcursor({
                cursor_id: cursor_id,
                ...payload,
              }),
            },
          ];
        }

        return cursors.map((u) => {
          if (u.cursor_id === cursor_id) {
            return {
              ...u,
              ...payload,
            };
          }
          return u;
        });
      });
    },
    []
  );

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
      syncstate(payload.payload.cursor_id, {
        x: payload.payload.x,
        y: payload.payload.y,
      });
    });
    ch.on("broadcast", { event: "LOCATION" }, (payload: Payload<ILocation>) => {
      if (!payload.payload) return;
      syncstate(payload.payload.cursor_id, {
        location: payload.payload.location,
      });
    });
    ch.on("broadcast", { event: "MESSAGE" }, (payload: Payload<any>) => {
      if (!payload.payload) return;
      syncstate(payload.payload.cursor_id, {
        message: payload.payload.message,
      });
    });
    ch.on("broadcast", { event: "NODE" }, (payload: Payload<any>) => {});
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSend(() => (event: string, payload: any) => {
          ch.send({
            type: "broadcast",
            event: event,
            payload: payload,
          });
        });
      }
    });

    return () => {
      room.unsubscribe();
      client.removeChannel(room);
    };
  }, [client, cursor_id, room_id, syncstate]);

  return { cursors, send, syncstate };
}

export function MultiplayerLayer() {
  const [state, dispatch] = useEditorState();
  const { room_id, cursor_id } = state.multiplayer;
  const location = usePathname();

  const { cursors, send, syncstate } = useMultiplayerRoom({
    room_id,
    cursor_id,
  });

  const [typing, setTyping] = useState(false);

  const [message, setMessage] = useState<string>();

  const [pos, setPos] = useState<{
    x: number;
    y: number;
  }>();

  const debouncedPos = useThrottle(pos, RT_THROTTLE_MS);

  useEffect(() => {
    const onkeydown = (e: KeyboardEvent) => {
      if (e.shiftKey) return;
      if (e.metaKey) return;
      if (e.key === "/") {
        setTyping(true);
        return;
      }

      if (e.key === "Escape") {
        setTyping(false);
        setMessage("");
        return;
      }
    };

    window.addEventListener("keydown", onkeydown);

    return () => {
      window.removeEventListener("keydown", onkeydown);
    };
  }, []);

  // POS hook
  useEffect(() => {
    const onmousemove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", onmousemove);

    return () => {
      window.removeEventListener("mousemove", onmousemove);
    };
  }, []);

  useEffect(() => {
    if (!send) return;
    send("LOCATION", { cursor_id: cursor_id, location: location });
  }, [location, send, cursor_id]);

  useEffect(() => {
    if (!send) return;
    if (
      !debouncedPos ||
      debouncedPos.x === undefined ||
      debouncedPos.y === undefined
    )
      return;

    send("POS", { cursor_id: cursor_id, x: debouncedPos.x, y: debouncedPos.y });
  }, [cursor_id, debouncedPos, send]);

  useEffect(() => {
    if (!send) return;
    send("MESSAGE", { cursor_id: cursor_id, message: message });
  }, [cursor_id, message, send, typing]);

  // local cursor update (without throttle)
  useEffect(() => {
    if (!pos || pos.x === undefined || pos.y === undefined) return;
    syncstate(cursor_id, { x: pos.x, y: pos.y });
  }, [cursor_id, pos, syncstate]);

  const current_location_other_cursors = useMemo(() => {
    return cursors.filter(
      (u) => u.location === location && u.cursor_id !== cursor_id
    );
  }, [cursors, location, cursor_id]);

  const mycursor = cursors.find((u) => u.cursor_id === cursor_id);

  // console.log("players", {
  //   cursors,
  //   current_location_players: current_location_other_cursors,
  //   mycursor,
  // });

  console.log("mycursor", mycursor);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {mycursor && (
        <Cursor
          local
          message={message}
          onMessageChange={setMessage}
          typing={typing}
          x={pos?.x ?? 0}
          y={pos?.y ?? 0}
          color={mycursor.color}
          onMessageBlur={() => {
            setTyping(false);
            setMessage("");
          }}
        />
      )}
      {current_location_other_cursors.map((u) =>
        u.x && u.y ? (
          <Cursor
            local={false}
            message={u.message}
            key={u.cursor_id}
            color={u.color}
            x={u.x}
            y={u.y}
          />
        ) : (
          <></>
        )
      )}
    </div>
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
  onMessageBlur,
}: {
  local: boolean;
  typing?: boolean;
  color: ColorName;
  x: number;
  y: number;
  message?: string;
  onMessageChange?: (message: string) => void;
  onMessageBlur?: () => void;
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
      {(message || typing) && (
        <CursorMessageBubble
          key={typing ? "typing" : "message"}
          local={local}
          color={fill}
          hue={hue}
          x={x + 16}
          y={y + 16}
          message={message}
          onMessageChange={onMessageChange}
          onMessageBlur={onMessageBlur}
        />
      )}
    </>
  );
}

function useBubbleVisibility(message: string, delay: number) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (message) {
      setIsVisible(true);

      const handler = setTimeout(() => {
        setIsVisible(false);
      }, delay);

      return () => clearTimeout(handler);
    }
  }, [message, delay]);

  return isVisible;
}

function CursorMessageBubble({
  local,
  x,
  y,
  color,
  hue,
  message,
  onMessageChange,
  onMessageBlur,
}: {
  local: boolean;
  color: string;
  hue: string;
  x: number;
  y: number;
  message?: string;
  onMessageChange?: (message: string) => void;
  onMessageBlur?: () => void;
}) {
  const isVisible = useBubbleVisibility(message ?? "", 3000);

  return (
    <motion.div
      data-local={local}
      initial={{ opacity: 1 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ opacity: { duration: isVisible ? 0 : 1.5 } }}
      onAnimationComplete={() => {
        if (!isVisible) {
          onMessageBlur?.();
          onMessageChange?.("");
        }
      }}
      className="absolute top-0 left-0 transform transition-transform duration-75 pointer-events-none data-[local='true']:duration-0"
      style={{
        transform: `translateX(${x}px) translateY(${y}px)`,
        zIndex: 999 - 1,
      }}
    >
      <div
        className="rounded-full h-10 min-w-48 w-full overflow-hidden border-2"
        style={{ backgroundColor: color, borderColor: hue }}
      >
        <input
          readOnly={!local}
          value={message}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onMessageBlur?.();
              return;
            }
            if (e.key === "Escape") {
              onMessageBlur?.();
              onMessageChange?.("");
              return;
            }
          }}
          onChange={(e) => {
            onMessageChange?.(e.target.value);
          }}
          onBlur={onMessageBlur}
          maxLength={100}
          className="px-4 w-full h-full bg-transparent outline-none border-none text-white placeholder:text-white/50"
          placeholder="Say something"
        />
      </div>
    </motion.div>
  );
}
