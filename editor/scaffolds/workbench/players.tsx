"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMultiplayer } from "../editor/multiplayer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";

const max = 5;

export default function Players() {
  const [multiplayer] = useMultiplayer();
  const { cursors, player, profiles } = multiplayer;

  const sliced_cursors = cursors.slice(0, max);
  const count = sliced_cursors.length;
  const total = cursors.length;

  const router = useRouter();

  return (
    <div className="flex -space-x-2 -mx-2">
      <PlayerAvatar
        type="local"
        colors={{
          ring: player.palette[400],
          fill: player.palette[600],
          text: player.palette[100],
        }}
        zIndex={count + 1}
        avatar={{
          src: profiles[player.user_id]?.avatar,
          fallback: profiles[player.user_id]?.display_name ?? "U",
        }}
      />
      {sliced_cursors.map((c, i) => (
        <PlayerAvatar
          key={c.cursor_id}
          type="remote"
          colors={{
            ring: c.palette[400],
            fill: c.palette[600],
            text: c.palette[100],
          }}
          zIndex={count - i}
          avatar={{
            src: profiles[c.user_id]?.avatar,
            fallback: profiles[c.user_id]?.display_name ?? "A",
          }}
          onClick={() => {
            if (c.location) router.push(c.location);
          }}
        />
      ))}
    </div>
  );
}

function PlayerAvatar({
  selected,
  colors,
  type,
  zIndex,
  avatar,
  onClick,
}: {
  selected?: boolean;
  type: "local" | "remote" | "anonymous";
  colors: {
    ring: string;
    fill: string;
    text: string;
  };
  zIndex: number;
  avatar: {
    src?: string;
    fallback: string;
  };
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          data-selected={selected}
          className="size-7 rounded-full bg-muted border-2 border-background focus:border-ring hover:border-ring hover:!z-10 transition data-[selected='true']:border-foreground data-[selected='true']:!z-10"
          style={{
            borderColor: type === "local" ? undefined : colors.ring,
            backgroundColor: type === "local" ? undefined : colors.fill,
            zIndex: zIndex,
          }}
          onClick={onClick}
        >
          <Avatar className="w-full h-full">
            <AvatarImage src={avatar.src} />
            <AvatarFallback
              className="text-xs"
              style={{
                color: type === "local" ? undefined : colors.text,
                backgroundColor: type === "local" ? undefined : colors.fill,
              }}
            >
              {fallback(avatar.fallback)}
            </AvatarFallback>
          </Avatar>
        </button>
      </TooltipTrigger>
      <TooltipContent>{tolltip(avatar.fallback, type)}</TooltipContent>
    </Tooltip>
  );
}

const fallback = (txt: string) => {
  return txt.slice(0, 2).toUpperCase();
};

const tolltip = (fallback: string, type: "local" | "remote" | "anonymous") => {
  switch (type) {
    case "local":
      return fallback + " (You)";
    case "remote":
      return fallback;
    case "anonymous":
      return "Anonymous";
  }
};
