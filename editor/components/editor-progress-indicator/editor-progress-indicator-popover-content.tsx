import React from "react";
import styled from "@emotion/styled";

export function EditorProgressIndicatorPopoverContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Container>{children}</Container>;
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 32px;
  box-shadow: 0px 4px 24px 0px rgba(0, 0, 0, 0.25);
  border: solid 1px rgb(74, 73, 77);
  border-radius: 12px;
  background-color: rgba(30, 30, 30, 0.4);
  box-sizing: border-box;
  padding: 24px;
  backdrop-filter: blur(32px);
`;
