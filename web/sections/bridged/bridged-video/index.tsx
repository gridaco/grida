import React from "react";
import { Flex, Button, Text } from "rebass";
import styled from "@emotion/styled";
import Icon from "components/icon";
import ElevatedVideoPlayer from "components/special/elevated-video-player";

const BridgedVideoSection = () => {
  return (
    <Frame alignItems="center" justifyContent="center">
      <Flex
        width={["320px", "730px", "985px", "1040px"]}
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
      >
        <Heading fontSize="80px" fontWeight="bold" textAlign="center">
          Designs that are meant to be implemented.
        </Heading>
        <Desc>
          All your contents, logics, components are already designed. With
          Bridged, You can make them alive with design to code, with automatic
          content backend in-the-box. With a click. A hackable tool that's
          designed for hackers.
        </Desc>
        <StartButton mt="40px" mb="20px" p={["12px 28px"]}>
          Start now
        </StartButton>
        <div style={{ margin: 0 }}>
          <ElevatedVideoPlayer />
        </div>
      </Flex>
    </Frame>
  );
};

export default BridgedVideoSection;

const Frame = styled(Flex)`
  margin-bottom: 120px;
`;

const StartButton = styled(Button)`
  font-size: 18px;
  font-weight: bold;
`;

const Heading = styled(Text)`
  max-width: 900px;
  margin-top: 60px;

  @media (max-width: 500px) {
    max-width: 280px;
    font-size: 48px;
  }
`;

const Desc = styled(Text)`
  max-width: 800px;
  font-size: 24px;
  font-weight: medium;
  text-align: center;
  margin-top: 40px;
  color: #444545;

  @media (max-width: 769px) {
    max-width: 570px;
  }

  @media (max-width: 500px) {
    max-width: 280px;
    font-size: 16px;
  }
`;

const SVGIcon = styled(Icon)`
  width: 100%;
  height: 100%;
`;
