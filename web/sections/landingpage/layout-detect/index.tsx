import React, { useState } from "react";
import SectionLayout from "layout/section";
import { Flex, Heading, Text } from "rebass";
import styled from "@emotion/styled";
import { media } from "utils/styled/media";
import BlankArea from "components/blank-area";
import { ThemeInterface } from "utils/styled/theme";
import ActionItem from "components/action-item";
import { LandingpageUrls } from "utils/landingpage/constants";
import MotionButton from "components/landingpage/motion/button";
import MotionRadio from "components/landingpage/motion/radio";
import ButtonDetectDemo from "components/landingpage/motion/button-detect-demo";

const renderMoitonComponents = [MotionButton];

const LayoutDetect = () => {
  const [currentMotionIndex, setCurrentMotionIndex] = useState(0);

  return (
    <SectionLayout alignContent="start">
      <Heading
        fontSize={["32px", "64px", "64px", "64px"]}
        style={{ lineHeight: "90%" }}
      >
        Yeah, we know.
      </Heading>
      <DetectTitle fontSize={["32px", "64px", "64px", "64px"]}>
        <span>That's a</span>{" "}
        {renderMoitonComponents.map(
          (i, ix) =>
            ix === currentMotionIndex % renderMoitonComponents.length &&
            i({
              onTriggerNext: () => {
                setCurrentMotionIndex(currentMotionIndex + 1);
              },
            }),
        )}
      </DetectTitle>
      <Description fontSize={["21px", "21px", "21px", "24.5px"]}>
        Finally, the tool understands your design. More inteligence means less
        modification. Which leads us to blazing fast workflow. Just design it.
        We’ll know.
      </Description>
      <BlankArea height={[33, 50]} />
      <ActionItem
        href={LandingpageUrls.article_how_engine_works}
        label="Learn how the engine works"
      />
      <SectionLayout
        className="button-detect-lottie-motion"
        variant="content-overflow-1"
        inherit={false}
        notAutoAllocateHeight
      >
        <ButtonDetectDemo />
      </SectionLayout>

      <BlankArea height={[150, 150]} />
    </SectionLayout>
  );
};

export default LayoutDetect;

const DetectTitle = styled(Heading)`
  line-height: 63px;
  letter-spacing: 0em;
  display: flex;
  align-items: center;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    align-items: flex-start;
    flex-direction: column;
    line-height: 98.1%;
  }
`;

const Description = styled(Text)`
  line-height: 38px;
  letter-spacing: 0em;
  max-width: 520px;
  margin-top: 40px;
  color: #444545;
  font-weight: 400;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
    line-height: 25px;
  }
`;
