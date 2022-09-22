import styled from "@emotion/styled";
import ApplicationPreview from "layouts/landingpage/application-preview";
import SectionLayout from "layouts/section";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Flex } from "theme-ui";

import ActionItem from "components/action-item";
import BlankArea from "components/blank-area";
import LandingpageText from "components/landingpage/text";
import { LandingpageUrls } from "utils/landingpage/constants";
import { media } from "utils/styled/media";
import { DesktopView, MobileView } from "utils/styled/styles";

import { contents } from "../k";
import DesignToCode from "./design-code";

interface OnlineAppProps {
  isMobile?: boolean;
}

const OnlineApp: React.FC<OnlineAppProps> = ({ isMobile }) => {
  const [assetUrl, setAssetUrl] = useState("/assets/gradient-bg.png");

  useEffect(() => {
    if (isMobile) {
      setAssetUrl("/assets/mobile/mobile-gradient-blur-sm.png");
    } else {
      setAssetUrl("/assets/gradient-bg.png");
    }
  }, [isMobile]);

  return (
    <SectionLayout alignContent="start" backgroundColor="rgba(0,0,0,0)">
      <DisableMargin>
        <DesignToCode />
      </DisableMargin>
      <Flex
        sx={{
          justifyContent: [
            "center",
            "space-between",
            "space-between",
            "space-between",
          ],
        }}
        style={{
          width: "100%",
        }}
      >
        <Flex
          style={{
            width: "100%",
            flexDirection: "column",
          }}
          mr="40px"
        >
          {/* <Text fontSize="24px" mb="15px" letterSpacing="0em">
            What you’ve just sketched?
          </Text> */}
          <OnlineTitle variant="h4">
            <span style={{ letterSpacing: "0em" }}>Less is more.</span>
            {/* <OnairButton /> */}
          </OnlineTitle>
          <MobileView style={{ marginTop: 40, position: "relative" }}>
            <ApplicationPreview />
            <div className="gradient-view no-drag">
              <Image
                src="/assets/mobile/mobile-gradient-blur-xs.png"
                loading="eager"
                alt="gradient-bg"
                width="768"
                height="520"
              />
            </div>
          </MobileView>
          <Description variant="body1">
            {contents.p_figma_onair_description}
          </Description>

          <BlankArea height={[48, 80]} />

          <ActionItem
            label="How does Design to code work?"
            href={LandingpageUrls.article_how_do_design_to_code_work}
          />
          <ActionItem
            label="Try the demo"
            href={LandingpageUrls.try_the_demo_1}
          />
        </Flex>
        <DesktopView style={{ position: "relative" }}>
          <ApplicationPreview />
          <div className="gradient-view no-drag">
            <Image
              loading="eager"
              src={assetUrl}
              alt="gradient"
              width="1040"
              height="1027"
            />
          </div>
        </DesktopView>
      </Flex>
      <BlankArea height={[73, 180]} />
    </SectionLayout>
  );
};

export default OnlineApp;

const OnlineTitle = styled(LandingpageText)`
  display: flex;
  align-items: center;

  ${props => media("0px", props.theme.breakpoints[0])} {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const Description = styled(LandingpageText)`
  max-width: 525px;
  margin-top: 30px !important;

  ${props => media("0px", props.theme.breakpoints[0])} {
    max-width: 100%;
  }
`;

export const DisableMargin = styled.div`
  .content-default {
    margin: 0px !important;
  }
`;
