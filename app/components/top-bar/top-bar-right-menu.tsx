import React from "react";
import styled from "@emotion/styled";
import { TopBarMultiplayerSegment } from "./top-bar-multiplayer-segment";
import { TopBarShareButton } from "./top-bar-share-button";
import { TopBarMoreButton } from "./top-bar-more-button";
export function TopBarRightMenu() {
  return (
    <_Root>
      <TopBarMultiplayerSegment />
      <div style={{ marginLeft: 8 }} />
      <TopBarShareButton />
      <div style={{ marginLeft: 8 }} />
      <TopBarMoreButton />
    </_Root>
  );
}

const _Root = styled.div`
  padding: 12px;
  display: flex;
  flex-direction: row;
`;
