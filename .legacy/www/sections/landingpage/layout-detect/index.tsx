import styled from "@emotion/styled";
import SectionLayout from "layouts/section";
import React, { useState } from "react";

import ActionItem from "components/action-item";
import BlankArea from "components/blank-area";
import MotionButton from "components/landingpage/motion/button";
import ButtonDetectDemo from "components/landingpage/motion/button-detect-demo";
import MotionRadio from "components/landingpage/motion/radio";
import LandingpageText from "components/landingpage/text";
import { LandingpageUrls } from "utils/landingpage/constants";
import { media } from "utils/styled/media";

const renderMoitonComponents = [MotionButton];

const LayoutDetect = () => {
  const [currentMotionIndex, setCurrentMotionIndex] = useState(0);

  return (
    <SectionLayout alignContent="start">
      <LandingpageText variant="h2">Yeah, we know.</LandingpageText>
      <DetectTitle variant="h2">
        <span>That's a</span>
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
      <Description variant="body1">
        Finally, the tool understands your design. More inteligence means less
        modification. Which leads us to blazing fast workflow. Just design it.
        We’ll know.
      </Description>
      <BlankArea height={[33, 50]} />
      <ActionItem
        href={LandingpageUrls.article_how_engine_works}
        as={LandingpageUrls.article_how_engine_works}
        // TODO: disable explicit locale once docs locale resolution is fixed.
        locale="en"
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

const DetectTitle = styled(LandingpageText)`
  display: flex;
  align-items: center;
  ${props => media("0px", props.theme.breakpoints[0])} {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const Description = styled(LandingpageText)`
  max-width: 520px;
  margin-top: 40px;
  ${props => media("0px", props.theme.breakpoints[0])} {
    max-width: 100%;
  }
`;
