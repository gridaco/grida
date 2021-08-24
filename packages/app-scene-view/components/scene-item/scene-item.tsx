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
      <ContextMenuTrigger id={id}>
        <ItemContainer
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <PreviewImageWrapper>
            <PreviewImage
              src={preview}
              data-selected={isSelected && "true"}
            ></PreviewImage>
          </PreviewImageWrapper>
          <Name>{name}</Name>
        </ItemContainer>
      </ContextMenuTrigger>
      <ContextMenu id={id}>
        <SceneItemContextMenu />
      </ContextMenu>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

const ItemContainer = styled.div`
  max-width: 360px;
  max-height: 800px;
  margin: 5px;
`;

const PreviewImageWrapper = styled.div`
  border: 1px solid #e7e7e7;
`;

const PreviewImage = styled.img`
  border-radius: 2px;
  max-height: 500px;
  display: flex;
  width: inherit;
  object-fit: cover;
  background-color: #f5f5f5;
  border: 1px solid #f5f5f5;

  user-select: none;
  -webkit-user-drag: none;

  &[data-selected="true"],
  &:hover {
    outline: 1px solid #cdcdcd;
  }
`;

const Name = styled.h6`
  margin: 0;
  margin-top: 7px;
  font-weight: normal;
  font-size: 12px;
  line-height: 14px;

  color: #747474;
`;
