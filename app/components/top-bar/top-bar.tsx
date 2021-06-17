import styled from "@emotion/styled";
import React from "react";

export function TopBar(props: { controlDoubleClick: () => void }) {
  return <TopBarRoot onDoubleClick={props.controlDoubleClick}></TopBarRoot>;
}

const TopBarRoot = styled.div`
  /** https://www.electronjs.org/docs/api/frameless-window#draggable-region - this is also present on side nav bar*/
  -webkit-app-region: drag;

  background-color: grey; /** test bg */

  width: 100%;
  max-width: 100vw;
  height: 45px;
  opacity: 1;
  transition: opacity 700ms ease 0s, color 700ms ease 0s;
  position: relative;
`;
