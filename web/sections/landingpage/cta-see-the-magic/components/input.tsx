import styled from "@emotion/styled";
import React from "react";

export function MagicInput({}: {}) {
  return (
    <StyledInput placeholder="https://www.figma.com/file/xxxx/xxxx?node-id=1234%3A5678" />
  );
}

export const StyledInput = styled.input`
  height: 80px;
  max-width: 1040px;
  flex: 1;
  padding: 24px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  position: relative;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  ::placeholder {
    color: rgba(210, 210, 210, 1);
  }
`;
