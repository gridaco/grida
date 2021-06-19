import styled from "@emotion/styled";
import React from "react";
import { BarDragArea } from "@editor-ui/desktop-titlebar";

export function TopBar(props: { controlDoubleClick: () => void }) {
  return (
    <BarDragArea controlDoubleClick={props.controlDoubleClick}>
      <TopBarRoot onDoubleClick={props.controlDoubleClick}></TopBarRoot>
    </BarDragArea>
  );
}

const TopBarRoot = styled.div`
  background-color: grey; /** test bg */

  width: 100%;
  max-width: 100vw;
  height: 45px;
  opacity: 1;
  transition: opacity 700ms ease 0s, color 700ms ease 0s;
  position: relative;
`;
