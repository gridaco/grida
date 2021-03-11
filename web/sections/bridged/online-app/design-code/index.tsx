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
      <Heading
        fontSize={["32px", "64px", "64px", "80px"]}
        style={{ letterSpacing: "0em", lineHeight: "98.1%" }}
      >
        Designs, <br />
        come to live
      </Heading>
      <Description fontSize={["18px", "24px", "24px", "24px"]}>
        Keep your design live. Not as a prototype, but as a ready product.
        Instantly convert your design to code, prototype and product within a
        click. No coding required.
      </Description>
      <SectionLayout
        className="design-to-code-absoulte-view"
        variant="full-width"
        inherit={false}
        notAutoAllocateHeight
      >
        <Positioner>
          <DesignPlatforms />
          <CodePreview />
        </Positioner>
      </SectionLayout>
      <BlankArea height={100} />
    </SectionLayout>
  );
};

export default DesignToCode;

const Description = styled(Text)`
  max-width: 520px;
  margin-top: 20px;
  color: #444545;
  font-weight: 500;

  line-height: 33px;
  letter-spacing: 0em;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
    line-height: 22px;
  }
`;

const Positioner = styled(Box)`
  position: relative;
  height: 600px;
  width: 100%;
  display: flex;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    height: 1200px;
  }
`;
