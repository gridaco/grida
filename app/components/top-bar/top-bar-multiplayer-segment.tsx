import React from "react";
import styled from "@emotion/styled";
import {
  MultiplayerAvatar,
  MultiplayerAvatarGroup,
} from "@editor-ui/multiplayer";

interface Player {
  name: string;
  image: string;
  id: string;
}

interface Props {
  isSimple?: boolean;
}

const players: Player[] = [
  {
    id: "1",
    name: "Albert",
    image: "",
  },
  {
    id: "2",
    name: "Albert",
    image: "",
  },
  {
    id: "3",
    name: "Albert",
    image: "",
  },
];

export function TopBarMultiplayerSegment(props: Props) {
  const handleOnAvatarItemClick = (id: string) => {
    console.log("avatar item click", id);
  };

  const _players = props.isSimple ? players.slice(0, 1) : players;

  return (
    <MultiplayerAvatarGroup spacing={-4}>
      {_players.map((p) => {
        return (
          <MultiplayerAvatar
            key={p.id}
            id={p.id}
            image={p.image}
            chars={charsFromName(p.name)}
            online
            onClick={handleOnAvatarItemClick}
          />
        );
      })}
    </MultiplayerAvatarGroup>
  );
}

function charsFromName(name: string): string {
  if (!name) {
    return "";
  }
  if (name.length == 1) {
    return name[0];
  } else if (name.length > 1) {
    return name[0] + name[1];
  }
  return "";
}
