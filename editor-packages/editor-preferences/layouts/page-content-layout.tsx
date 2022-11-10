import React from "react";
import styled from "@emotion/styled";
export function PageContentLayout({ children }: React.PropsWithChildren<{}>) {
  return <Container>{children}</Container>;
}

const Container = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;

  h1 {
    color: white;
    font-size: 21px;
    margin: 16px 0 32px;
  }
`;
