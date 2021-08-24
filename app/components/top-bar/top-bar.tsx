import React from "react";
import styled from "@emotion/styled";
import { TopBarRightMenu } from "./top-bar-right-menu";
import { TopBarLeftBreadcrumb } from "./top-bar-left-breadcrumb";
import { BarDragArea } from "../bar-drag-area";
import { css } from "@emotion/react";

export function TopBar(props: {
  controlDoubleClick: () => void;
  contorlModal?: () => void;
  title?: string;
  isMain?: boolean;
  isSimple?: boolean;
}) {
  return (
    <BarDragArea
      controlDoubleClick={props.controlDoubleClick}
      isMain={props.isMain}
    >
      <TopBarRoot
        isMain={props.isMain}
        onDoubleClick={props.controlDoubleClick}
      >
        <TopBarLeftArea>
          <Title>{props.title}</Title>
          <TopBarLeftBreadcrumb />
        </TopBarLeftArea>
        <TopBarRightArea>
          <TopBarRightMenu
            isSimple={props.isSimple}
            contorlModal={props.contorlModal}
          />
        </TopBarRightArea>
      </TopBarRoot>
    </BarDragArea>
  );
}

const TopBarRoot = styled.div<{ isMain?: boolean }>`
  height: 56px;
  opacity: 1;
  max-width: 100vw;
  transition: opacity 700ms ease 0s, color 700ms ease 0s;

  /* isMain is contorl top bar style (use only top-bar and bar-drag-area) */
  ${(props) =>
    !!props.isMain
      ? css`
          width: 100%;
          position: relative;
          background-color: #ffffff;
        `
      : css`
          width: 100%;
          position: absolute;
          top: 0;
          right: 0;
          z-index: 999;
        `}

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
  padding: 0 12px;
`;
