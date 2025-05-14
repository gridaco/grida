import React from "react";
import styled from "@emotion/styled";
export function PageContentLayout({
  children,
  direction,
  spacebetween,
}: React.PropsWithChildren<{
  direction?: "row" | "column";
  spacebetween?: boolean;
}>) {
  return (
    <Container
      style={{
        flexDirection: direction,
        justifyContent: spacebetween ? "space-between" : "flex-start",
      }}
    >
      {children}
    </Container>
  );
}

const Container = styled.div`
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;

  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  p {
    color: white;
    h1 {
      font-size: 21px;
      margin: 16px 0 32px;
    }
    h2 {
      margin: 14px 0 28px;
    }
  }

  details {
    color: white;
  }
`;
