import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Flex } from "rebass";
import DocsSearchBar from "components/docs-search-bar";
import DocsNavigationSection from "components/docs-navigation-section";
import { DocsPost } from "../../utils/docs/model";

function DocsNavigation(props: { docs: DocsPost[] }) {
  return (
    <NavigationWrapper flexDirection="column" mr="70px">
      <DocsSearchBar />
      {props.docs &&
        Object.keys(props.docs).map(i => (
          <DocsNavigationSection key={`navigation`} docs={props.docs[i]} />
        ))}
    </NavigationWrapper>
  );
}

export default DocsNavigation;

const NavigationWrapper = styled(Flex)`
  min-width: 250px;
  height: 100%;
`;
