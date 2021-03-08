import React, { useState } from 'react'
import SectionLayout from 'layout/section'
import { Flex, Heading, Text } from 'rebass'
import styled from '@emotion/styled';
import { media } from 'utils/styled/media';
import BlankArea from 'components/blank-area';
import { ThemeInterface } from 'utils/styled/theme';
import ActionItem from 'components/action-item';
import { LandingpageUrls } from "utils/landingpage/constants";
import MotionButton from "components/motion/button";
import MotionRadio from "components/motion/radio";
import ButtonDetectDemo from 'components/motion/button-detect-demo';

const renderMoitonComponents = [MotionButton];

const LayoutDetect = () => {
  const [currentMotionIndex, setCurrentMotionIndex] = useState(0);

  return (
    <SectionLayout alignContent="start" >
      <Heading fontSize={["32px", "64px", "64px", "80px"]}>Yeah, we know.</Heading>
      <DetectTitle fontSize={["32px", "64px", "64px", "80px"]}>
        <span>That's a</span> {renderMoitonComponents.map(
          (i, ix) =>
            ix === currentMotionIndex % renderMoitonComponents.length &&
            i({
              onTriggerNext: () => {
                setCurrentMotionIndex(currentMotionIndex + 1);
              },
            }),
        )}
      </DetectTitle>
      <Description fontSize={["21px", "21px", "21px", "24px"]}>Finally, the tool understands your design. More inteligence means less modification. Which leads us to blazing fast workflow.</Description>
      <SectionLayout variant="content-overflow-1" inherit={false}>
        <ButtonDetectDemo />
      </SectionLayout>
      <BlankArea height={30} />
      <ActionItem
        href={LandingpageUrls.article_how_engine_works}
        label="Learn how the engine works"
      />

      <BlankArea height={150} />

    </SectionLayout>
  )
}

export default LayoutDetect

const DetectTitle = styled(Heading)`
  display: flex;
  align-items: center;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    align-items: flex-start;
    flex-direction: column;
  }
`

const Description = styled(Text)`
  max-width: 520px;
  margin-top: 40px;
  color: #444545;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
  }
`