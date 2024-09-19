"use client";

import { useMultiplayer } from "../editor/multiplayer";

const max = 5;

export default function Players() {
  const [multiplayer] = useMultiplayer();
  const { cursors, player } = multiplayer;

  const sliced_cursors = cursors.slice(0, max);
  const count = sliced_cursors.length;
  const total = cursors.length;

  return (
    <div className="flex -space-x-2 -mx-2">
      <PlayerAvatar
        is_local={true}
        color={player.palette[400]}
        zIndex={count + 1}
      />
      {sliced_cursors.map((c, i) => (
        <PlayerAvatar
          key={c.cursor_id}
          is_local={false}
          color={c.palette[400]}
          zIndex={count - i}
        />
      ))}
    </div>
  );
}

function PlayerAvatar({
  selected,
  color,
  is_local,
  zIndex,
}: {
  selected?: boolean;
  is_local: boolean;
  color: string;
  zIndex: number;
}) {
  return (
    <button
      data-selected={selected}
      className="w-7 h-7 rounded-full bg-muted border-2 border-background focus:border-ring hover:border-ring hover:!z-10 transition data-[selected='true']:border-foreground data-[selected='true']:!z-10"
      style={{
        borderColor: is_local ? undefined : color,
        backgroundColor: is_local ? "black" : undefined,
        zIndex: zIndex,
      }}
    />
  );
}
