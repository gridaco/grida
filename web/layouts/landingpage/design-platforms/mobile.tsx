import styled from "@emotion/styled";
import Image from "next/image";
import React, { useState } from "react";
import { Flex } from "rebass";

import LiveDesignDemoFrame from "components/landingpage/motion/live-design-demo";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

const renderPlatforms = ["figma", "sketch", "adobexd"];

const DesignPlatformsMobile = () => {
  const [currentPlatform, setCurrentPlatform] = useState("figma");
  return (
    <Positoner>
      <div className="platform-preview">
        <Image
          loading="eager"
          alt="Grida supported design platforms"
          src={`/assets/design-platforms/${currentPlatform}.png`}
          width="auto"
          height="565px"
        />
      </div>
      <PlatformView className="previews">
        <LiveDesignDemoFrame />
        <div className="platforms">
          {renderPlatforms.map(i => (
            <Image
              loading="eager"
              alt="Grida supported platfrom icons"
              key={i}
              className="cursor"
              onClick={() => setCurrentPlatform(i)}
              src={`/assets/platform-icons/${i}/${
                currentPlatform === i ? "default" : "grey"
              }.png`}
              width="24"
              height="24"
            />
          ))}
        </div>
      </PlatformView>
    </Positoner>
  );
};

export default DesignPlatformsMobile;

const Positoner = styled(Flex)`
  position: relative;
  margin-top: 40px;

  .platform-preview {
    transform: translateX(0.5%);
    opacity: 0.6;
    box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);

    div {
      width: 507px !important;
      height: 317px !important;
    }
  }
`;

const PlatformView = styled.div`
  position: absolute;
  z-index: 950;
  border-radius: 8px;
  margin-top: 72px;
  margin-left: 50px;
  height: 580px;

  .platforms > div {
    width: 24px;
    height: 24px;
    margin-right: 28px !important;
  }

  .platforms {
    margin-top: 20px;
  }
`;
