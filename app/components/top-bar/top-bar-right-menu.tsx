import React from "react";
import styled from "@emotion/styled";
import { TopBarMultiplayerSegment } from "./top-bar-multiplayer-segment";
import { TopBarShareButton } from "./top-bar-share-button";
import { TopBarMoreButton } from "./top-bar-more-button";

interface Props {
  isScenes?: boolean;
}

export function TopBarRightMenu(props: Props) {
  return (
    <_Root>
      <TopBarMultiplayerSegment isScenes={props.isScenes} />

      {!props.isScenes && (
        <>
          <MarginRight size={24} />
          <TopBarShareButton />
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
