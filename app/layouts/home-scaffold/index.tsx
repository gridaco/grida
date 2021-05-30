import styled from "@emotion/styled";
import React from "react";

export function HomeScaffold(props: {
  children: JSX.Element;
  navigation: JSX.Element;
}) {
  return (
    <Root>
      <NavigationWrapper>{props.navigation}</NavigationWrapper>
      <BodyWrapper>{props.children}</BodyWrapper>
    </Root>
  );
}

const NAV_WIDTH = "200px";

const Root = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: row;
`;

const NavigationWrapper = styled.div`
  height: 100%;
  width: ${NAV_WIDTH};
  position: fixed; /* Stay in place */
  z-index: 1; /* Stay on top */
  top: 0; /* Stay at the top */
  left: 0;
  background-color: #f6f6f6; /* Black*/
  overflow-x: hidden; /* Disable horizontal scroll */
`;

const BodyWrapper = styled.div`
  margin-left: ${NAV_WIDTH};
`;
