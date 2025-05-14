import React from "react";
import styled from "@emotion/styled";
import { colors } from "theme";

export function SideNavigation(props: {
  children: JSX.Element | JSX.Element[];
}) {
  return <Wrapper>{props.children}</Wrapper>;
}

const Wrapper = styled.div`
  flex: 0;
  background: ${colors.color_editor_bg_on_dark};
  display: flex;
  align-items: stretch;
  flex-direction: column;
  min-height: 100%;
  height: 100vh;
  overflow-y: hidden;
`;
