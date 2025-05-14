import React from "react";
import styled from "@emotion/styled";
import { GearIcon } from "@radix-ui/react-icons";

export function EditorFrameworkConfigOnAppbar() {
  return (
    <Wrapper>
      <FrameworkName>Flutter</FrameworkName>
      <GearIcon color={"#787878"} width={16} />
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 4px;
  align-self: stretch;
  box-sizing: border-box;
`;

const FrameworkName = styled.span`
  color: rgba(124, 124, 124, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;
