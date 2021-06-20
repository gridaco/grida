import React from "react";
import styled from "@emotion/styled";
import { TopBarMultiplayerSegment } from "./top-bar-multiplayer-segment";
import { TopBarShareButton } from "./top-bar-share-button";
import { TopBarMoreButton } from "./top-bar-more-button";
export function TopBarRightMenu() {
  return (
    <>
      <TopBarMultiplayerSegment />
      <TopBarShareButton />
      <TopBarMoreButton />
    </>
  );
}
