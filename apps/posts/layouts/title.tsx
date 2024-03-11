import React from "react";
import styled from "@emotion/styled";

export function TitleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Title>
      {/*  */}
      {children}
    </Title>
  );
}

const Title = styled.span`
  cursor: default;
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 48px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;
