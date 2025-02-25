import styled from "@emotion/styled";
import React from "react";

export function HeroPrimaryButton({
  onClick,
  children,
}: React.PropsWithChildren<{ onClick?: () => void }>) {
  return (
    <Base onClick={onClick}>
      <Label>{children}</Label>
    </Base>
  );
}

const Base = styled.button`
  cursor: pointer;
  flex: 1;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  border: solid 1px rgba(37, 98, 255, 0.5);
  border-radius: 4px;
  align-self: stretch;
  background-color: rgba(37, 98, 255, 1);
  box-sizing: border-box;
  padding: 12px 48px;

  :hover {
    opacity: 0.9;
  }

  :focus {
  }
`;

const Label = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Inter", sans-serif;
  font-weight: 500;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: center;
`;
