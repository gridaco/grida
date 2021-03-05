import React from "react";
import Image from "next/image";
import { Flex, Button, Text, Box } from "rebass";
import styled from "@emotion/styled";
import Link from "next/link";
import Icon from "components/icon";
import CodeFrameworks from "./code-framework";
import DesignPlatforms from "./design-platform";
import ActionItem from "components/action-item";
import { LandingpageUrls } from "utils/landingpage/constants";
import AppUi from "./app-ui";

const Onair = () => {
  return <OnairButton>ON AIR</OnairButton>;
};

const OnairButton = styled.button`
  margin-right: auto;
  margin-top: 20px;
  // region gradient animation
  background: linear-gradient(318deg, #f537ff, #ff6565, #ff379f, #ff373e);
  background-size: 800% 800%;

  animation: AutoGradient 3s ease infinite;

  @keyframes AutoGradient {
    0% {
      background-position: 0% 42%;
    }
    50% {
      background-position: 100% 59%;
    }
    100% {
      background-position: 0% 42%;
    }
  }
  // endregion gradient animation

  box-shadow: 0px 4px 32px rgba(255, 0, 0, 0.25);
  width: 140px;
  padding: 12px;
  border: none;
  border-radius: 19px;
  color: #fff;
  font-size: 32px;
  font-weight: bold;

  @media (min-width: 500px) {
   margin-left: 20px;
  margin-top: 0px;
  }
`;

const BridgedIntroduce = () => {
  return (
    <IntroduceWrapper alignItems="center" justifyContent="center">
      <Flex
        width={["320px", "730px", "985px", "1040px"]}
        mx="20px"
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
      >
        <Box mr="auto">
          <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold">
            Designs,
          </Text>
          <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold">
            come to live.
          </Text>

          <Desc mr="auto" mt="30px">
            Keep you design live, not as a prototype, but as a product.
            Instantly convert your design to code, prototype, product within a
            click. No coding required
          </Desc>
        </Box>
        <AbsoulteImageArea>
          <DesignPlatforms />
          <CodeFrameworks />
        </AbsoulteImageArea>
        <Flex width="100%" justifyContent="space-between">
          <Box>
            <Text fontSize="24px" mb="17px">
              What you’ve just sketched?
            </Text>
            <Flex alignItems="center" flexDirection={["column", "column", "row"]} mb="35px">
              <Text
                fontSize={["36px", "36px", "64px"]}
                fontWeight="bold"
                mr="auto"
              >
                That just got
              </Text>
              <Onair />
            </Flex>

            <LiveAreaMobile className="no-drag">
              <Image
                className="app"
                src="/iPhone12-frame-blank.png"
                width="390"
                height="788"
              />
              <IphoneAppView>
                <AppUi />
              </IphoneAppView>
              <GradientView>
                <Image src="/gradient-live.png" width="478" height="814" />
              </GradientView>
            </LiveAreaMobile>

            <Desc mr="auto" mb="70px">
              Design to Code Feature supports Major design tools including
              Sketch, Figma and Adobe XD. Code is converted to Major Platforms /
              Languages / Frameworks with various coding styles. These lines of
              code is ready to use.
            </Desc>

            <ActionItem
              label="How do Design to code work?"
              href={LandingpageUrls.article_how_do_design_to_code_work}
            />
            <ActionItem
              label="Try the demo"
              href={LandingpageUrls.try_the_demo_1}
            />
          </Box>
          <LiveAreaDesktop className="no-drag">
            <IphoneView className="app">
              <Image src="/iPhone12-frame-blank.png" width="auto" height="auto" />
            </IphoneView>
            <IphoneAppView>
                <AppUi />
            </IphoneAppView>
            <GradientView>
              <Image src="/gradient-live.png" width="1440" height="1040" />
            </GradientView>
          </LiveAreaDesktop>
        </Flex>
      </Flex>
    </IntroduceWrapper>
  );
};

export default BridgedIntroduce;

const IphoneAppView = styled(Box)`
    position: absolute;
    top: 2.5%;
    right: 5.5%;

    div {
      width: 290px !important;
      height: 625px !important;
    }

  @media (max-width: 720px) {
    right: 21.5%;
    div {
      width: 260px !important;
      height: 540px !important;
    }
  }

  @media (max-width: 430px) {
    right: 16%;
    div {
      width: 260px !important;
      height: 540px !important;
    }
  }

  @media (max-width: 375px) {
    right: 11.5%;
    div {
      width: 260px !important;
      height: 540px !important;
    }
  }

  @media (max-width: 320px) {
    right: 4%;
    div {
      width: 260px !important;
      height: 540px !important;
    }
  }
`;

const Platforms = styled(Flex)`
  height: 36px;

  span {
    width: 24px;
    height: 24px;
    background-color: #000;
    margin-left: 24px;
  }
  
`;

const IntroduceWrapper = styled(Flex)`
  height: 2000px;

  @media (max-width: 768px) {
    height: 2700px;
  }
`;

const Desc = styled(Text)`
  max-width: 520px;
  font-size: 24px;
  color: #444545;

  @media (max-width: 800px) {
    max-width: 455px;
  }
`;

const AbsoulteImageArea = styled(Flex)`
  height: 750px;
  position: relative;
  width: 100%;
  margin-bottom: 150px;

  @media (max-width: 720px) {
    flex-direction: column;
    height: 1050px;
    margin-bottom: 100px;
  }
`;

const LiveAreaDesktop = styled(Box)`
  position: relative;

  @media (max-width: 768px) {
    display: none;
  }
`;

const IphoneView = styled(Flex)`
  img {
    width: 325px !important;
    height: 657px !important;
    z-index: 1;
  }
`;

const LiveAreaMobile = styled(Flex)`
  position: relative;
  margin-bottom: 40px;

  @media (min-width: 768px) {
    display: none;
  }

  @media (max-width: 720px) {
    align-items: center;
    justify-content: center;
    img {
      width: 280px !important;
      height: 566px !important;
      z-index: 1;
    }
  }
`;

const GradientView = styled(Box)`
  position: absolute;
  width: 2080px !important;
  height: 1765px;
  top: -75%;
  left: -170%;
  filter: blur(600px);
  z-index: -1;

  @media (max-width: 720px) {
    width: 768px !important;
    height: 1297px !important;

    img {
      width: 768px !important;
      height: 1297px !important;
    }
  }
`;
