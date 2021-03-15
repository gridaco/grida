import React, { useState, useRef, useEffect } from "react";
import { Box, Flex } from "rebass";
import styled from "@emotion/styled";
import Image from "next/image";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import LiveDesignDemoFrame from "components/motion/live-design-demo";
import SectionLayout from "layout/section";

const renderPlatforms = ["figma", "sketch", "adobexd"];

const DesignPlatforms = () => {
  const [currentPlatform, setCurrentPlatform] = useState("figma");
  const scrollRef = useRef(null);

  // useEffect(() => {
  //   window.addEventListener(
  //     "resize",
  //     () => (scrollRef.current.scrollLeft = 295),
  //   );

  //   return window.addEventListener(
  //     "resize",
  //     () => (scrollRef.current.scrollLeft = 295),
  //   );
  // }, []);

  return (
    <React.Fragment>
      <SectionLayout variant="full-width" inherit={false} alignContent="center">
        <Flex width="100%" height="100%">
          <Postioner
            width="50%"
            justifyContent="flex-end"
            flexDirection="column"
          >
            <div className="platforms-preview" ref={scrollRef}>
              <Image
                alt="platform"
                src={`/assets/design-platforms/${currentPlatform}.png`}
                width="auto"
                height="565px"
              />
            </div>
          </Postioner>
          <Box width="50%" height="100%" />
        </Flex>
      </SectionLayout>
      <PlatformView className="previews">
        <LiveDesignDemoFrame />
        <div className="platforms">
          {renderPlatforms.map(i => (
            <Image
              alt="platform"
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
    </React.Fragment>
    // <AbosulteView width="50%">
    //   <PlatformView>
    //     <div className="platform-image">
    //       <Image
    //         alt="platform"
    //         src={`/assets/design-platforms/${currentPlatform}.png`}
    //         width="auto"
    //         height="auto"
    //       />
    //     </div>

    //  <LiveDesignDemoFrame />
    //   </PlatformView>
    // </AbosulteView>
  );
};

export default DesignPlatforms;

const PlatformView = styled.div`
  position: absolute;
  z-index: 950;
  border-radius: 12px;
  top: 24%;
  transform: translateY(-23.5%);
  margin-left: auto;
  height: 580px;

  .platforms > div {
    width: 24px;
    height: 24px;
    margin-right: 28px !important;
  }

  .platforms {
    margin-top: 20px;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    transform: translateY(-27.5%);
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[1],
      (props.theme as ThemeInterface).breakpoints[2],
    )} {
    transform: translateY(-24%);
  }
`;

const Postioner = styled(Flex)`
  position: relative;

  .platforms-preview {
    margin-left: auto;
    overflow: auto;
    margin-top: 60px;
    max-width: 920px;
    width: 100%;
    opacity: 0.6;
    div {
      min-width: 818px;
      left: 20%;
      transform: translateX(-20%);
      max-width: 920px !important;
      width: 100% !important;
    }

    ${props =>
      media(
        (props.theme as ThemeInterface).breakpoints[0],
        (props.theme as ThemeInterface).breakpoints[3],
      )} {
      direction: rtl;
    }
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    width: 80% !important;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[1],
      (props.theme as ThemeInterface).breakpoints[2],
    )} {
    width: 60% !important;
  }
`;
