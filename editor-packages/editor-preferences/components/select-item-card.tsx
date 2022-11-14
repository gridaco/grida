import React from "react";
import styled from "@emotion/styled";

export function SelectItemCard({
  children,
  selected,
  onClick,
}: React.PropsWithChildren<{
  selected?: boolean;
  onClick?: () => void;
}>) {
  return (
    <SelectWrapper onClick={onClick} data-selected={selected}>
      {children}
    </SelectWrapper>
  );
}

const SelectWrapper = styled.div`
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 12px;
  box-sizing: border-box;

  &[data-selected="true"] {
    opacity: 1;
  }

  &[data-selected="false"] {
    opacity: 0.5;
  }

  &:hover {
    opacity: 0.8;
  }

  transition: all 0.2s ease-in-out;

  label {
    color: white;
    text-overflow: ellipsis;
    font-size: 12px;
    font-family: Inter, sans-serif;
    font-weight: 400;
    text-align: left;
  }

  .preview-container {
    display: flex;
    justify-content: center;
    flex-direction: row;
    align-items: center;
    flex: none;
    gap: 10px;
    border-radius: 8px;
    background-color: black;
    box-sizing: border-box;
    padding: 20px;
  }

  &[data-selected="true"] {
    .preview-container {
      outline: solid 1px white;
      box-shadow: 0px 4px 24px 0px rgba(0, 0, 0, 0.2);
    }
  }

  &[data-selected="false"] {
    .preview-container {
      outline: none;
      box-shadow: none;
    }
  }
`;
