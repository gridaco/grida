import React from "react";
import { Flex } from "rebass";
import styled from "@emotion/styled";
import ElevatedVideoPlayer from "components/special/elevated-video-player";
import { Section } from "components/section";

const BridgedVideoSection = () => {
  return (
    <Frame alignItems="center" flexDirection="column" justifyContent="center">
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