import React from "react";
import styled from "@emotion/styled";

export function HomeHeading({ children }: { children: React.ReactNode }) {
  return <Heading>{children}</Heading>;
}

export const Heading = styled.h1`
  color: white;
`;
