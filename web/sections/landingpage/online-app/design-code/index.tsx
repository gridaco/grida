import React from "react";
import SectionLayout from "layout/section";
import { Box, Flex, Heading, Text } from "rebass";
import styled from "@emotion/styled";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import DesignPlatforms from "layout/landingpage/design-platforms";
import CodePreview from "layout/landingpage/code-preview";
import BlankArea from "components/blank-area";
import { css } from "@emotion/core";
import LandingpageText from "components/landingpage/text";

const DesignToCode = () => {
  return (
    <SectionLayout alignContent="start" backgroundColor="rgba(0,0,0,0)">
      <Flex width="100%" flexDirection={["column", "row", "row", "row"]}>
        <Flex className="text-platform" flexDirection="column">
          <Title variant="h1">
            Designs, <br />
            come to live.
          </Title>
          <Description variant="body1">
            Keep your design live. Not as a prototype, but as a ready product.
            Instantly convert your design to code, prototype and product within
            a click. No coding required.
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

const Title = styled(LandingpageText)`
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