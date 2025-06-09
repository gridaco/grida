"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function PlayerAvatar({
  selected,
  colors,
  type,
  zIndex,
  avatar,
  onClick,
  tooltip,
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
  tooltip?: string | React.ReactNode;
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
      <TooltipContent>
        {tooltip ?? mktooltip(avatar.fallback, type)}
      </TooltipContent>
    </Tooltip>
  );
}

const fallback = (txt: string) => {
  return txt.slice(0, 2).toUpperCase();
};

const mktooltip = (
  fallback: string,
  type: "local" | "remote" | "anonymous"
) => {
  switch (type) {
    case "local":
      return fallback + " (You)";
    case "remote":
      return fallback;
    case "anonymous":
      return "Anonymous";
  }
};
