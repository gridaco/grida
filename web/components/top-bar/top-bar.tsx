import React from "react";
import styled from "@emotion/styled";
import { BarDragArea } from "@editor-ui/desktop-titlebar";
import { TopBarRightMenu } from "./top-bar-right-menu";
import { TopBarLeftBreadcrumb } from "./top-bar-left-breadcrumb";
export function TopBar(props: {
  controlDoubleClick: () => void;
  title?: string;
}) {
  return (
    <BarDragArea controlDoubleClick={props.controlDoubleClick}>
      <TopBarRoot onDoubleClick={props.controlDoubleClick}>
        <TopBarLeftArea>
          <Title>{props.title}</Title>
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
  background-color: #ffffff;

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

const Title = styled.p`
  font-size: 14px;
  line-height: 17px;
  margin: 15px 0;
  margin-left: 21px;
  color: #7b7b7b;
`;

const TopBarRightArea = styled.div`
  align-self: center;
`;
