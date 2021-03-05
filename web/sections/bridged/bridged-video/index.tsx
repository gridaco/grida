import React from "react";
import { Flex, Button, Text } from "rebass";
import styled from "@emotion/styled";
import Icon from "components/icon";
import ElevatedVideoPlayer from "components/special/elevated-video-player";
import { Typography } from '@reflect-ui/react-core';
import { Section } from "components/section";
import BlankArea from "components/blank-area";

const BridgedVideoSection = () => {
  return (
    <Frame alignItems="center" flexDirection="column" justifyContent="center">
      <BlankArea height={60} />
      <Section
        align="center"
        title="Designs that are meant to be implemented."
        description="Make twice no more. All you’ll ever need for frontend development. A hackable tool that's designed for hackers."
        isButton
        buttonOption={{
          label: "Start now",
          href: "",
          marginOption: "40px 0px 20px 0px"
        }}
      />
      <div style={{ margin: 0 }}>
        <ElevatedVideoPlayer />
      </div>
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

  @media (max-width: 850px) {
    max-width: 720px;
  }

  @media (max-width: 500px) {
    max-width: 90%;
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
