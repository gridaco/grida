import styled from "@emotion/styled";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { Box, Flex, Text } from "rebass";

import DocsNavigationMobile from "components/docs-navigation-mobile";
import DocsNavigationSection from "components/docs-navigation-section";
import DocsSearchBar from "components/docs-search-bar";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import { center } from "utils/styled/styles";
import { ThemeInterface } from "utils/styled/theme";

import { DocsManifest, DocsRoute } from "../../utils/docs/model";

const docsmanifest = import("../../../docs/manifest");
function DocsNavigation() {
  const [manifest, setManifest] = useState<DocsManifest>();
  const [isOpen, setIsOpen] = useState(false);
  const [currentRouter, setCurrentRouter] = useState("");
  const router = useRouter();

  useEffect(() => {
    docsmanifest.then(d => {
      const newmanifest: DocsManifest = d.default.routes as any;
      setManifest(newmanifest);
    });
  }, []);

  useEffect(() => {
    setCurrentRouter(router.asPath);

    if (currentRouter != router.asPath && currentRouter != "") {
      router.reload();
    }
  }, [router]);

  const docs = manifest ? manifest[0] : undefined;
  return (
    <NavigationWrapper
      flexDirection="column"
      mr={["0px", "70px", "70px", "70px"]}
    >
      {/* <DocsSearchBar /> */}
      <Desktop>
        {docs &&
          docs.routes.map(i => (
            <DocsNavigationSection key={i.title} route={i} />
          ))}
      </Desktop>
      <Mobile>
        <Wrapper>
          <Text
            style={center}
            className="cursor"
            fontSize="18px"
            fontWeight="bold"
            onClick={() => setIsOpen(!isOpen)}
          >
            <Icon
              isVerticalMiddle
              name="arrowDown"
              style={{ transform: "rotate(270deg)" }}
            />
            Menu
          </Text>
          <Box ml="20px">
            {isOpen &&
              docs &&
              docs.routes.map(i => (
                <DocsNavigationSection key={i.title} route={i} />
              ))}
          </Box>
        </Wrapper>
      </Mobile>
    </NavigationWrapper>
  );
}

export default DocsNavigation;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 16px 20px;
  width: calc(100% - 40px);
  background: #ffffff;
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.08);
`;

const NavigationWrapper = styled(Flex)`
  min-width: 250px;
  height: 100%;
`;

const Mobile = styled.div`
  display: none;
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: block;
  }
`;

const Desktop = styled.div`
  display: block;
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: none;
  }
`;
