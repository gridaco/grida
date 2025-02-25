import React from "react";
import styled from "@emotion/styled";
import { TopBarMultiplayerSegment } from "./top-bar-multiplayer-segment";
import { TopBarShareButton } from "./top-bar-share-button";
import { TopBarMoreButton } from "./top-bar-more-button";
import { IPlayer } from "./player-type";

interface Props {
  isMain: boolean;
  players?: IPlayer[];
  contorlModal?: () => void;
  invisible?: {
    playerSegment?: boolean;
    share?: boolean;
    more?: boolean;
  };
}

export function TopBarRightMenu(props: Props) {
  const invisible = props.invisible;
  {
    /**
     * temporary!
      1. Currently, only your profile is entered
      2. Some right menus should not be visible only in scenes.
    */
  }
  return (
    <_Root>
      {!invisible?.playerSegment && (
        <TopBarMultiplayerSegment players={props.players} />
      )}
      {!invisible?.share && (
        <>
          <MarginRight size={24} />
          <TopBarShareButton contorlModal={props.contorlModal} />
        </>
      )}
      {!invisible?.more && (
        <>
          <MarginRight size={19} />

          <TopBarMoreButton />
        </>
      )}
    </_Root>
  );
}

const _Root = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const MarginRight = styled.div<{ size: number }>`
  margin-right: ${(props) => `${props.size}px`};
`;
