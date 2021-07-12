import React from "react";
import styled from "@emotion/styled";

export function SideNavigation(props: {
  children: JSX.Element | JSX.Element[];
}) {
  return <Wrapper>{props.children}</Wrapper>;
}

const Wrapper = styled.div`
  flex: 0;
  min-width: 200px;
  display: flex;
  align-items: stretch;
  flex-direction: column;
  min-height: 100%;
`;
