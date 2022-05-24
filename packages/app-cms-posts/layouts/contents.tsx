import React from "react";
import styled from "@emotion/styled";

export function ContentsLayout({ children }: { children: React.ReactNode }) {
  return <Container>{children}</Container>;
}

const Container = styled.div`
  width: 100%;
`;
