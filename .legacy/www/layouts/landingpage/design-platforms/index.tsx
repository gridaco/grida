import styled from "@emotion/styled";
import SectionLayout from "layouts/section";
import Image from "next/image";
import React, { useState } from "react";
import { Box, Flex } from "theme-ui";

import LiveDesignDemoFrame from "components/landingpage/motion/live-design-demo";
import { media } from "utils/styled/media";

import DesignPlatformsMobile from "./mobile";

const renderPlatforms = ["figma", "sketch", "adobexd"];

const DesignPlatforms = () => {
  const [currentPlatform, setCurrentPlatform] = useState("figma");

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
      <Mobile>
        <DesignPlatformsMobile />
      </Mobile>
      <Desktop>
        <SectionLayout
          variant="full-width"
          inherit={false}
          alignContent="center"
        >
          <Flex
            style={{
              width: "100%",
              height: "100%",
            }}
          >
            <Postioner
              style={{
                width: "50%",
                justifyContent: "flex-end",
                flexDirection: "column",
              }}
            >
              <div className="platforms-preview">
                <Image
                  loading="eager"
                  alt="Grida supported design patforms"
                  src={`/assets/design-platforms/${currentPlatform}.png`}
                  objectFit="cover"
                  width={904}
                  height={564}
                />
              </div>
            </Postioner>
            <Box
              style={{
                width: "50%",
                height: "100%",
              }}
            />
          </Flex>
        </SectionLayout>
        <PlatformView className="previews">
          <LiveDesignDemoFrame />
          <div className="platforms">
            {renderPlatforms.map(i => (
              <Image
                loading="eager"
                alt="Grida supported platform icons"
                key={i}
                className="cursor-pointer"
                onClick={() => setCurrentPlatform(i)}
                src={`/assets/platform-icons/${i}/${currentPlatform === i ? "default" : "grey"
                  }.png`}
                width="24"
                height="24"
              />
            ))}
          </div>
        </PlatformView>
      </Desktop>
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
  position: relative;
  z-index: 950;
  border-radius: 8px;
  top: -500px;
  margin-left: auto;
  height: 580px;

  .platforms > span {
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
    overflow: visible;
    opacity: 0.6;
    span {
      box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
      min-width: 818px;
      left: 20%;
      transform: translateX(-20%);
      max-width: 920px !important;
      width: 100% !important;
    }

    ${props => media(props.theme.breakpoints[0], props.theme.breakpoints[3])} {
      direction: rtl;
    }
  }

  ${props => media(props.theme.breakpoints[0], props.theme.breakpoints[1])} {
    width: 80% !important;
  }

  ${props => media(props.theme.breakpoints[1], props.theme.breakpoints[2])} {
    width: 60% !important;
  }
`;

const Mobile = styled.div`
  display: none;
  ${props => media("0px", props.theme.breakpoints[0])} {
    display: block;
    margin-bottom: 300px;
  }
`;

const Desktop = styled.div`
  display: block;
  height: 700px;
  ${props => media("0px", props.theme.breakpoints[0])} {
    display: none;
  }
`;
