import React, { useState } from "react";
import { Flex, Box } from "rebass";
import styled from "@emotion/styled";
import Image from "next/image";
import Icon from "components/icon";
import LiveDesignDemoFrame from "./live-design-demo";

const renderPlatforms = ["figma", "sketch", "adobexd"];

const DesignPlatforms = () => {
  const [currentPlatform, setCurrentPlatform] = useState("figma");

  return (
    <Flex
      height="100%"
      flex={1}
      flexDirection="column"
      alignItems="flex-start"
      justifyContent="flex-end"
    >
      <PlatformView className="no-drag">
        <PlatformAppBackgroundView>
          <Image
            alt="platform"
            src={`/live-desing-apps/${currentPlatform}.png`}
            width="904"
            height="565"
          />
        </PlatformAppBackgroundView>
        <LiveDesignDemoFrame />
      </PlatformView>
      <Platforms>
        {renderPlatforms.map(i => (
          <Image
            alt="platform"
            key={i}
            className="cursor"
            onClick={() => setCurrentPlatform(i)}
            src={`/platform-icons/${i}/${currentPlatform === i ? "default" : "grey"
              }.png`}
            width="24"
            height="24"
          />
        ))}
      </Platforms>
    </Flex>
  );
};

export default DesignPlatforms;

const Platforms = styled(Box)`
  div {
    width: 24px;
    height: 24px;
    margin-right: 28px !important;
  }
`;

const PlatformAppBackgroundView = styled.div`
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  opacity: 0.7;
`;

const PlatformView = styled(Flex)`
  flex-direction: column;
  position: absolute;

  @media (min-width: 940px) {
    top: 10%;
    left: -38%;
  }

  @media (max-width: 940px) {
    top: 5%;
    left: -50% !important;
  }

  @media (max-width: 800px) {
    top: 10%;
    left: -65% !important;
  }

  @media (max-width: 720px) {
    top: 5%;
    right: -20% !important;
    left: auto !important;

    img {
      width: 500px;
      height: 310px;
    }
  }

  @media (max-width: 400px) {
    img {
      width: 500px;
      height: 310px;
      top: 5%;
      right: -10% !important;
      left: auto !important;
    }
  }

  /* @media (max-width: 320px) {
    width: 526px;
    height: 423px;
    top: 5% !important;
    left: 10% !important;
  } */
`;
