import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Flex } from "rebass";
import DocsSearchBar from "components/docs-search-bar";
import DocsNavigationSection from "components/docs-navigation-section";
import { DocsManifest, DocsRoute } from "../../utils/docs/model";
const manifestJson = import("../../../docs/manifest.json");

function DocsNavigation() {
  const [manifest, setManifest] = useState<DocsManifest>();
  useEffect(() => {
    manifestJson.then(d => {
      const newmanifest: DocsManifest = d.routes as any;
      setManifest(newmanifest);
    });
  }, []);

  const docs = manifest ? manifest[0] : undefined;
  return (
    <NavigationWrapper flexDirection="column" mr="70px">
      <DocsSearchBar />
      {docs &&
        docs.routes.map(i => <DocsNavigationSection key={i.title} route={i} />)}
    </NavigationWrapper>
  );
}

export default DocsNavigation;

const NavigationWrapper = styled(Flex)`
  min-width: 250px;
  height: 100%;
`;
