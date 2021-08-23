import React from "react";
import styled from "@emotion/styled";
import { TopBarMultiplayerSegment } from "./top-bar-multiplayer-segment";
import { TopBarShareButton } from "./top-bar-share-button";
import { TopBarMoreButton } from "./top-bar-more-button";
export function TopBarRightMenu() {
  return (
    <_Root>
      <TopBarMultiplayerSegment />
      <MarginRight size={24} />
      <TopBarShareButton />
      <MarginRight size={19} />

      <TopBarMoreButton />
    </_Root>
  );
}

const _Root = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: row;
`;

const MarginRight = styled.div<{ size: number }>`
  margin-right: ${(props) => `${props.size}px`};
`;
