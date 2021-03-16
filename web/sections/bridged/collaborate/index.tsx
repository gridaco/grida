import React from "react";
import SectionLayout from "layout/section";
import { Flex, Heading, Text } from "rebass";
import styled from "@emotion/styled";
import Icon from "components/icon";
import { ThemeInterface } from "utils/styled/theme";
import { media } from "utils/styled/media";
import BlankArea from "components/blank-area";
import Image from "next/image";

const Collaborate = () => {
  return (
    <SectionLayout
      variant="content-overflow-1"
      alignContent="start"
      backgroundColor="rgb(0,0,0,0)"
    >
      <Flex
        mt="20px"
        mx="20px"
        flexDirection={["column", "column", "row", "row"]}
      >
        <SyncIcon name="loading" mr="20px" />
        <Heading fontSize={["32px", "64px"]} style={{ lineHeight: "98.1%" }}>
          Collaborate as
          <br />
          the way it should be
        </Heading>
      </Flex>
      <Description fontSize={["21px", "21px", "21px", "25px"]} mx="20px">
        With Bridged’s super intuitive workflow, you’ll find out how
        blazing-fast the collaborating can get. Create your products as the way
        it make sense. When the cycle gets shorter, the good thing happens.
        Forget all the time you’ve spent repeating yourself.
      </Description>
      <BlankArea height={[50, 50]} />
      <SectionLayout
        className="bottom-application-notification"
        variant="full-width"
        inherit={false}
        notAutoAllocateHeight
      >
        <BackgroundImage>
          <div className="background-img">
            <Image
              src="/assets/collaborate-background-img.png"
              width="100%"
              height="100%"
              alt="collaborate-background-img"
            />
          </div>
          <div className="notifications">
            {[...Array(3)].map((_, ix) => (
              <div
                key={ix}
                className="notification"
                style={{ right: 10 * ix, bottom: 10 * ix }}
              >
                <Image
                  key="notification"
                  src="/assets/notification.png"
                  width="auto"
                  height="auto"
                  alt="notification"
                />
              </div>
            ))}
          </div>
          <div className="application-ui">
            <Image
              src="/assets/application-image-view.png"
              width="auto"
              height="auto"
              alt="application-image-view"
            />
          </div>
        </BackgroundImage>
      </SectionLayout>
    </SectionLayout>
  );
};

export default Collaborate;

const SyncIcon = styled(Icon)`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    width: 32px;
    height: 32px;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[1],
      (props.theme as ThemeInterface).breakpoints[2],
    )} {
    width: 64px;
    height: 64px;
  }
`;

const Description = styled(Text)`
  line-height: 38px;
  margin-top: 36px;
  color: #444545;
  margin-left: 120px;
  max-width: 655px;
  font-weight: 400;
  letter-spacing: 0em;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
    margin-left: 20px;
    line-height: 25px;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    margin-left: 20px;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[1],
      (props.theme as ThemeInterface).breakpoints[2],
    )} {
    margin-left: 100px;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[2],
      (props.theme as ThemeInterface).breakpoints[3],
    )} {
    margin-left: 120px;
  }
`;

const BackgroundImage = styled(Flex)`
  position: relative;

  .background-img {
    background-color: #000;
    div {
      width: 100vw !important;
      height: 55vh !important;
      z-index: 1;
    }
  }

  .notifications {
    position: absolute;
    width: 700px;
    height: 250px;
    transform: translate(55vw, 0px);
    z-index: 3;

    .notification {
      width: 100%;
      height: 100%;
      position: absolute;

      div {
        max-width: 690px;
        max-height: 225px;
        width: 90% !important;
        height: 80% !important;
      }
    }
  }

  .application-ui {
    position: absolute;
    width: 100% !important;
    height: 100%;
    bottom: -10%;
    left: 27%;
    z-index: 2;

    div {
      max-width: 515px !important;
      height: 1040px;
      width: 100% !important;
    }
  }

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    .notifications {
      transform: translate(50vw, 5vh);
    }

    .notifications > .notification > div {
      width: 50% !important;
      height: 45% !important;
    }

    .application-ui {
      left: 5%;
      bottom: -30%;
    }

    .application-ui > div {
      max-width: 280px !important;
      max-height: 600px;
    }
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    .application-ui {
      left: 5%;
      bottom: -10%;
    }
  }
`;
