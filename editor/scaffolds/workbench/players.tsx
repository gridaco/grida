"use client";
import { useMultiplayer } from "../editor/multiplayer";
import { useRouter } from "next/navigation";
import { PlayerAvatar } from "@/components/multiplayer/avatar";

const max = 5;

export default function Players() {
  const [multiplayer] = useMultiplayer();
  const { cursors, player, profiles } = multiplayer;

  const sliced_cursors = cursors.slice(0, max);
  const count = sliced_cursors.length;

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
