import React from "react";
import styled from "@emotion/styled";
import { TopBarRightMenu } from "./top-bar-right-menu";
import { TopBarLeftBreadcrumb } from "./top-bar-left-breadcrumb";
import { BarDragArea } from "../bar-drag-area";
import { css } from "@emotion/react";

export function TopBar(props: {
  controlDoubleClick: () => void;
  title?: string;
  isMain?: boolean;
}) {
  return (
    <BarDragArea controlDoubleClick={props.controlDoubleClick}>
      <TopBarRoot
        isMain={props.isMain}
        onDoubleClick={props.controlDoubleClick}
      >
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

const TopBarRoot = styled.div<{ isMain?: boolean }>`
  /* background-color: #ffffff; */
  /* width: 100%; */
  /* max-width: 100vw; */
  height: 56px;
  padding: 0 12px;
  opacity: 1;
  transition: opacity 700ms ease 0s, color 700ms ease 0s;

  /*  200 is main navigation width*/
  ${(props) =>
    !!props.isMain
      ? css`
          max-width: calc(100vw - 200px);
        `
      : css``}

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
