import styled from "@emotion/styled";
import React from "react";

export function FigmaAuthDoneModalContents({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <RootWrapperContents>
      <Spacer></Spacer>
      <Body>Great. we’re now ready to go.</Body>
      <Button onClick={onClick}>Let’s go</Button>
    </RootWrapperContents>
  );
}

const RootWrapperContents = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 48px;
  box-sizing: border-box;
`;

const Spacer = styled.div`
  width: 32px;
  height: 32px;
  background-color: rgba(255, 255, 255, 1);
`;

const Body = styled.span`
  color: rgba(104, 104, 104, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Inter", sans-serif;
  font-weight: 400;
  line-height: 141%;
  text-align: center;
  align-self: stretch;
`;

const Button = styled.button`
  cursor: pointer;
  border-radius: 4px;
  height: 54px;
  background-color: rgba(37, 98, 255, 1);
  box-sizing: border-box;
  padding: 10px 16px;
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Inter", sans-serif;
  font-weight: 400;
  line-height: 141%;
  text-align: center;
  outline: none;
  border: none;

  :hover {
    opacity: 0.9;
  }

  :focus {
    opacity: 0.8;
  }
`;
