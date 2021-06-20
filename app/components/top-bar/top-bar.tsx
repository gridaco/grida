import React from "react";
import styled from "@emotion/styled";
import { BarDragArea } from "@editor-ui/desktop-titlebar";
import { TopBarRightMenu } from "./top-bar-right-menu";
import { TopBarLeftBreadcrumb } from "./top-bar-left-breadcrumb";
export function TopBar(props: { controlDoubleClick: () => void }) {
  return (
    <BarDragArea controlDoubleClick={props.controlDoubleClick}>
      <TopBarRoot onDoubleClick={props.controlDoubleClick}>
        <TopBarLeftArea>
          <TopBarLeftBreadcrumb />
        </TopBarLeftArea>
        <TopBarRightArea>
          <TopBarRightMenu />
        </TopBarRightArea>
      </TopBarRoot>
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

  /* flex */
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  align-content: stretch;
  flex-direction: row;
`;

const TopBarLeftArea = styled.div``;
const TopBarRightArea = styled.div`
  align-self: center;
`;
