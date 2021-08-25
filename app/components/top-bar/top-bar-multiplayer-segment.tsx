import React from "react";
import styled from "@emotion/styled";
import {
  MultiplayerAvatar,
  MultiplayerAvatarGroup,
} from "@editor-ui/multiplayer";
import { UserProfile } from "../../../packages/type";

// interface Player {
//   name: string;
//   image: string;
//   id: string;
// }

interface Props {
  isSimple?: boolean;
  players?: UserProfile;
}

// const players: Player[] = [
//   {
//     id: "1",
//     name: "Albert",
//     image:
//       "https://s3-us-west-1.amazonaws.com/accounts.bridged.xyz/default-images/user-profile-image/default-profile-image.png",
//   },
//   {
//     id: "2",
//     name: "Albert",
//     image: "",
//   },
//   {
//     id: "3",
//     name: "Albert",
//     image: "",
//   },
// ];

export function TopBarMultiplayerSegment(props: Props) {
  const _players: UserProfile[] = [];
  if (props.players) {
    _players.push(props.players);
  }

  const handleOnAvatarItemClick = (id: string) => {
    console.log("avatar item click", id);
  };

  return (
    <MultiplayerAvatarGroup spacing={-4}>
      {_players.map((p) => {
        return (
          <MultiplayerAvatar
            key={p.id}
            id={p.id}
            image={p.profileImage}
            chars={"U"}
            // chars={charsFromName(p.name)}
            online
            // onClick={handleOnAvatarItemClick}
            onClick={() => {}}
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
