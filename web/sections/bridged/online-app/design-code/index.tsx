import React from "react";
import SectionLayout from "layout/section";
import { Box, Flex, Heading, Text } from "rebass";
import styled from "@emotion/styled";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import DesignPlatforms from "layout/design-platforms";
import CodePreview from "layout/code-preview";
import BlankArea from "components/blank-area";
import { css } from "@emotion/core";

const DesignToCode = () => {
  return (
    <SectionLayout alignContent="start" backgroundColor="rgba(0,0,0,0)">
      <Flex width="100%">
        <Flex className="text-platform" flexDirection="column">
          <Heading
            fontSize={["32px", "64px", "64px", "64px"]}
            style={{ letterSpacing: "0em", lineHeight: "98.1%" }}
            mb={["10px"]}
          >
            Designs, <br />
            come to live.
          </Heading>
          <Description fontSize={["18px", "24px", "24px", "25px"]}>
            Keep your design live. Not as a prototype, but as a ready product.
            Instantly convert your design to code, prototype and product within
            a click. No coding required.
          </Description>
          <DesignPlatforms />
        </Flex>
        <Flex className="code-view" width="50%" justifyContent="flex-end">
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
      <BlankArea height={190} />
    </SectionLayout>
  );
};

export default DesignToCode;

const Description = styled(Text)`
  max-width: 520px;
  margin-top: 20px;
  color: #444545;
  font-weight: 400;

  line-height: 33px;
  line-height: 38px;
  letter-spacing: 0em;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
    line-height: 22px;
  }
`;

const Mobile = styled.div`
  display: none
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: block;
  }
`;

const Desktop = styled.div`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
    line-height: 22px;
  }
`;