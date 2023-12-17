import React from "react";
import styled from "@emotion/styled";
import { Cross1Icon } from "@radix-ui/react-icons";

export function Filetab({
  onClick,
  onCloseClick,
  onDoubleClick,
  children,
  selected,
  placed,
}: React.PropsWithChildren<{
  onCloseClick?: () => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  placed?: boolean;
  selected?: boolean;
}>) {
  return (
    <TabContainer
      data-placed={placed}
      data-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {children}
      <Cross1Icon
        onClick={onCloseClick}
        width={12}
        height={12}
        className="icon"
      />
    </TabContainer>
  );
}

const TabContainer = styled.div`
  cursor: default;
  user-select: none;
  display: flex;
  color: rgba(255, 255, 255, 0.4);
  flex-direction: row;
  align-items: center;
  border-radius: 4px;
  font-size: 13px;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px;

  &[data-selected="true"] {
    color: rgba(255, 255, 255, 0.8);
  }

  &[data-placed="false"] {
    font-style: italic;
  }

  &:hover {
    color: white;
    background-color: rgba(255, 255, 255, 0.1);

    .icon {
      opacity: 0.5;
    }
  }

  .icon {
    color: white;
    opacity: 0;
    &:hover {
      opacity: 1;
    }
    transition: all 0.1s ease-in-out;
  }
`;
