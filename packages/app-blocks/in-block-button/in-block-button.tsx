import React from "react";
import styled from "@emotion/styled";

export function InBlockButton({
  icon,
  children,
  onClick,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Container onClick={onClick}>
      {icon ? <IconContainer>{icon}</IconContainer> : <></>}
      <Label>{children}</Label>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  cursor: pointer;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  border-radius: 4px;
  box-sizing: border-box;
  padding: 8px;

  :hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  :active {
    background-color: rgba(0, 0, 0, 0.1);
  }

  transition: background-color 0.1s ease-in-out;
`;

const IconContainer = styled.div`
  width: 16px;
  height: 16px;
`;

const Label = styled.span`
  color: rgba(26, 26, 26, 0.7);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;
