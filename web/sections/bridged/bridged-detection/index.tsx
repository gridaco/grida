import React, { useState } from "react";
import { Flex, Text, Box } from "rebass";
import styled from "@emotion/styled";
import { LandingpageUrls } from "utils/landingpage/constants";
import ActionItem from "components/action-item";
import MotionButton from "components/motion/button";
import MotionRadio from "components/motion/radio";
import ButtonDetectionDemoFrame from "./demos/button.demo";

const renderMoitonComponents = [MotionButton, MotionRadio];

const BridgedDetection = () => {
  const [currentMotionIndex, setCurrentMotionIndex] = useState(0);

  return (
    <DetectionWrapper
      flexDirection="column"
      alignItems="center"
      width="100%"
      justifyContent="center"
    >
      <Box mr="auto">
        <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold">
          Yes, we know.
        </Text>
        <Flex alignItems="center" flexDirection={["column", "column", "row"]}>
          <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" mr="auto">
            That's a
          </Text>
          {renderMoitonComponents.map(
            (i, ix) =>
              ix === currentMotionIndex % renderMoitonComponents.length &&
              i({
                onTriggerNext: () => {
                  setCurrentMotionIndex(currentMotionIndex + 1);
                },
              }),
          )}
        </Flex>
      </Box>

      <Desc mr="auto" mt="48px">
        Finally, the tool understands your design. More inteligence means less
        modification. Which leads us to blazing fast workflow.
      </Desc>

      <Box width="100%"  mt="90px" mb="100px">
        <ButtonDetectionDemoFrame />
      </Box>

      <ActionItem
        href={LandingpageUrls.article_how_engine_works}
        label="Learn how the engine works"
      />
    </DetectionWrapper>
  );
};

export default BridgedDetection;

const DetectionWrapper = styled(Flex)`
  height: 1400px;

  @media (max-width: 767px) {
    height: 900px;
  }
`;

const Desc = styled(Text)`
  max-width: 520px;
  font-size: 24px;
  color: #444545;

  @media (max-width: 767px) {
    max-width: 280px;
  }
`;
