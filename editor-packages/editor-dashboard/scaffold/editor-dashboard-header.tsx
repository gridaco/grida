import styled from "@emotion/styled";
import React from "react";

export function EditorHomeHeader({
  onQueryChange,
}: {
  onQueryChange?: (query: string) => void;
}) {
  return (
    <EditorHomeHeaderWrapper>
      <SearchBar>
        <input
          type="text"
          placeholder="Filter by name"
          onChange={(e) => {
            onQueryChange?.(e.target.value);
          }}
        />
      </SearchBar>
    </EditorHomeHeaderWrapper>
  );
}

const EditorHomeHeaderWrapper = styled.div`
  position: fixed;
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  overflow: hidden;
  padding: 24px 40px;
  z-index: 9;
  flex: 1;
  background-color: rgba(20, 20, 20, 0.8);
  backdrop-filter: blur(40px);
`;

const SearchBar = styled.div`
  display: flex;
  flex-direction: row;

  input {
    background: transparent;
    color: rgba(255, 255, 255, 0.8);
    width: 620px;
    border: 1px solid #eaeaea;
    border-radius: 4px;
    padding: 8px;
    font-size: 14px;
    outline: none;
    border: 1px solid rgba(255, 255, 255, 0.05);

    &:focus,
    &:hover {
      border: 1px solid rgba(255, 255, 255, 0.4);
    }
  }
`;
