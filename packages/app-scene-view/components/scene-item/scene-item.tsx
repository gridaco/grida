import React, { useState } from "react";
import { ContextMenu, ContextMenuTrigger } from "react-contextmenu";
import styled from "@emotion/styled";

import { SceneItemContextMenu } from "../context-menus";

export interface ISceneItemDisplay {
  name: string;
  description?: string;
  updatedAt: string;
  preview: string;
}

interface ISceneItem {
  id: string;
  isSelected: boolean;
  data: ISceneItemDisplay;
  onSelected?: (id: string) => void;
  onDoubleClick?: (id: string) => void;
}

export const SceneItem = ({
  id,
  isSelected,
  data: { preview, name, description },
  onSelected,
  onDoubleClick,
}: ISceneItem) => {
  const [hover, setHover] = useState<boolean>(false);

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onDoubleClick && onDoubleClick(id);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onSelected && onSelected(id);
  };

  const handleMouseEnter = () => setHover(true);

  const handleMouseLeave = () => setHover(false);

  return (
    <Wrapper>
      <Inner>
        <ContextMenuTrigger id={id}>
          <ItemContainer
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <PreviewImageWrapper data-selected={isSelected && "true"}>
              <PreviewImage src={preview}></PreviewImage>
            </PreviewImageWrapper>
            <Name>{name}</Name>
          </ItemContainer>
        </ContextMenuTrigger>
        <ContextMenu id={id}>
          <SceneItemContextMenu />
        </ContextMenu>
      </Inner>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  /* justify-content: center; */
  cursor: pointer;
`;

const Inner = styled.div`
  width: 100%;
`;

const ItemContainer = styled.div`
  /* max-width: 240px;
  max-height: 516px; */
  margin: 5px;
`;

const PreviewImageWrapper = styled.div`
  background: #f5f5f5;
  border: 1px solid #f5f5f5;
  border-radius: 2px;

  &[data-selected="true"],
  &:hover {
    border: 1px solid #cdcdcd;
    border-radius: 2px;
  }
`;

const PreviewImage = styled.img`
  display: block;
  border-radius: 1px;
  max-width: inherit;
  width: 100%;
  max-width: 240px;
  max-height: 516px;
  display: flex;
  object-fit: cover;
  background-color: #f5f5f5;
  /* border: 2px solid #f5f5f5; */

  user-select: none;
  -webkit-user-drag: none;
`;

const Name = styled.h6`
  margin: 0;
  margin-top: 7px;
  font-weight: normal;
  font-size: 12px;
  line-height: 14px;

  color: #747474;
`;
