import styled from "@emotion/styled";
import SectionLayout from "layouts/section";
import Image from "next/image";
import React from "react";
import { Flex } from "theme-ui";

import BlankArea from "components/blank-area";
import Icon from "components/icon";
import LandingpageText from "components/landingpage/text";
import { media } from "utils/styled/media";

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
        sx={{
          flexDirection: ["column", "column", "row", "row"],
        }}
      >
        <SyncIcon name="loading" mr="20px" />
        <LandingpageText variant="h2">
          Collaborate as
          <br />
          the way it should be
        </LandingpageText>
      </Flex>
      <Description variant="body1">
        With Grida’s super intuitive workflow, you’ll find out how blazing-fast
        the collaborating can get. Create your products as the way it make
        sense. When the cycle gets shorter, the good thing happens. Forget all
        the time you’ve spent repeating yourself.
      </Description>
      <BlankArea height={[0, 50]} />
      <SectionLayout
        className="bottom-application-notification"
        variant="full-width"
        inherit={false}
        notAutoAllocateHeight
      >
        <BackgroundImage>
          <div className="background-img">
            <Image
              loading="eager"
              src="/assets/collaborate-background-img.png"
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
                  loading="eager"
                  key="notification"
                  src="/assets/notification.png"
                  alt="Grida collaboration slack notification"
                />
              </div>
            ))}
          </div>
          <div className="application-ui">
            <Image
              src="/assets/application-image-view.png"
              loading="eager"
              alt="Grida collaboration for app developers"
            />
          </div>
        </BackgroundImage>
      </SectionLayout>
    </SectionLayout>
  );
};

export default Collaborate;

export const SyncIcon = styled(Icon)`
  ${props => media("0px", props.theme.breakpoints[0])} {
    width: 32px;
    height: 32px;
  }

  ${props => media(props.theme.breakpoints[1], props.theme.breakpoints[2])} {
    width: 64px;
    height: 64px;
  }
`;

export const Description = styled(LandingpageText)`
  margin-top: 36px;
  margin-left: 120px;
  max-width: 655px;

  ${props => media("0px", props.theme.breakpoints[0])} {
    max-width: 100%;
    margin-left: 20px;
  }

  ${props => media(props.theme.breakpoints[0], props.theme.breakpoints[1])} {
    margin-left: 20px;
  }

  ${props => media(props.theme.breakpoints[1], props.theme.breakpoints[2])} {
    margin-left: 100px;
  }

  ${props => media(props.theme.breakpoints[2], props.theme.breakpoints[3])} {
    margin-left: 120px;
  }
`;

const BackgroundImage = styled(Flex)`
  position: relative;

  .background-img {
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

  ${props => media("0px", props.theme.breakpoints[0])} {
    .notifications {
      transform: translate(50vw, 5vh);
    }

    .notifications > .notification > span {
      width: 50% !important;
      height: 45% !important;
    }

    .application-ui {
      left: 5%;
      bottom: -30%;
    }

    .application-ui > span {
      max-width: 280px !important;
      max-height: 600px;
    }
  }

  ${props => media(props.theme.breakpoints[0], props.theme.breakpoints[1])} {
    .application-ui {
      left: 5%;
      bottom: -10%;
    }
  }
`;
