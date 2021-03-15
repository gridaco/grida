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

    ${props => media((props.theme as ThemeInterface).breakpoints[0],(props.theme as ThemeInterface).breakpoints[3])} {
      direction: rtl;
    }
  }
`;

const AbosulteView = styled(Flex)`
  top: 5%;
  left: 15%;

  .platform-image > div {
    box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
    max-width: none !important;
    width: 904px !important;
    height: 565px !important;
  }

  .platforms > div {
    width: 24px;
    height: 24px;
    margin-right: 28px !important;
  }

  .platforms {
    width: 110%;
    left: 50%;
    bottom: -100px;
  }

  .preview {
    box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
    width: 440px;
    height: 540px;
    background-color: #f3f3f3;
    border-radius: 12px;
    right: 12.5%;
    bottom: -7.5%;
  }

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    right: 5%;

    .platform-image > div {
      width: 507px !important;
      height: 317px !important;
    }

    .platforms {
      bottom: -150px;
      left: 0%;
    }

    .preview {
      left: 0%;
      bottom: -30%;
      width: 280px;
      height: 349px;
    }
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    left: -60%;

    .platforms {
      left: 130%;
    }

    .preview {
      left: 105%;
      bottom: -7.5%;
    }
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[1],
      (props.theme as ThemeInterface).breakpoints[2],
    )} {
    left: -30%;

    .platforms {
      left: 70%;
    }

    .preview {
      left: 65%;
      bottom: -7.5%;
    }
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[2],
      (props.theme as ThemeInterface).breakpoints[3],
    )} {
    left: -15%;

    .platforms {
      left: auto;
      right: -65%;
    }

    .preview {
      left: 55%;
      bottom: -7.5%;
    }
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[3], "")} {
    left: 5%;

    .preview {
      left: 40%;
      bottom: -7.5%;
    }
  }
`;
