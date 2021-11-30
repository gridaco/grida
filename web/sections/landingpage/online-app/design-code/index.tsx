import { css } from "@emotion/core";
import styled from "@emotion/styled";
import CodePreview from "layout/landingpage/code-preview";
import DesignPlatforms from "layout/landingpage/design-platforms";
import SectionLayout from "layout/section";
import React from "react";
import { Box, Flex, Heading, Text } from "rebass";

import BlankArea from "components/blank-area";
import LandingpageText from "components/landingpage/text";
import { k } from "sections";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

const DesignToCode = () => {
  return (
    <SectionLayout alignContent="start" backgroundColor="rgba(0,0,0,0)">
      <Flex width="100%" flexDirection={["column", "row", "row", "row"]}>
        <Flex className="text-platform" flexDirection="column">
          <Title variant="h2">{k.contents.heading2_everything_instant}</Title>
          <Description variant="body1">
            {k.contents.p_everything_instant_description}
          </Description>
          <DesignPlatforms />
        </Flex>
        <Flex
          className="code-view"
          width={["100%", "50%", "50%", "50%"]}
          justifyContent={["flex-start", "flex-end", "flex-end", "flex-end"]}
        >
          <CodePreview />
        </Flex>
      </Flex>
      {/* <SectionLayout
        className="design-to-code-absoulte-view"
        variant="full-width"
        inherit={false}
        notAutoAllocateHeight
      >
        <Positioner>
          <DesignPlatforms />
          <CodePreview />
        </Positioner>
      </SectionLayout> */}
      <BlankArea height={[100, 190]} />
    </SectionLayout>
  );
};

export default DesignToCode;

export const Title = styled(LandingpageText)`
  margin-bottom: 10px;
  z-index: 99;
`;

const Description = styled(LandingpageText)`
  max-width: 520px;
  margin-top: 20px;
  z-index: 99;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: calc(100vw - 40px);
  }
`;
