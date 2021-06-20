import styled from "@emotion/styled";
import React from "react";
import { TopBar } from "../../components";

export function HomeScaffold(props: {
  children: JSX.Element;
  navigation: JSX.Element;
  controlDoubleClick: () => void;
}) {
  return (
    <Root>
      <NavigationWrapper>{props.navigation}</NavigationWrapper>
      <ContentAndTopBarFrame>
        <TopBar controlDoubleClick={props.controlDoubleClick} />
        <BodyWrapper>{props.children}</BodyWrapper>
      </ContentAndTopBarFrame>
    </Root>
  );
}

const NAV_WIDTH = "200px";

const Root = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: row;
  overflow: auto;
`;

const ContentAndTopBarFrame = styled.div`
  flex: none;
  order: 1;
  align-self: stretch;
  flex-grow: 1;
  margin: 0px 0px;

  /* flex root */
  display: flex;
  flex-direction: column;
`;

const NavigationWrapper = styled.div`
  height: 100%;
  width: ${NAV_WIDTH};
  z-index: 1; /* Stay on top */
  top: 0; /* Stay at the top */
  left: 0;
  background-color: #f6f6f6;
  overflow-x: auto; /* Disable horizontal scroll */
`;

const BodyWrapper = styled.div`
  /* child of flex */
  flex: 1;

  overflow-x: hidden;
  overflow-y: scroll;
  max-height: 100%;
  max-width: 100%;

`;
