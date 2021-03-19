import React from "react";
import SectionLayout from "layout/section";
import styled from "@emotion/styled";
import BlankArea from "components/blank-area";
import { ElevatedVideoPlayer } from "components/landingpage/effect";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import LandingMainCtaButton from "components/landingpage/main-cta-button";
import LandingpageText from "components/landingpage/text";

const Hero = () => {
  return (
    <SectionLayout alignContent="center">
      <BlankArea height={[101, 198]} />
      <HeroText variant="h1" textAlign="center">
        Designs that are meant to be implemented.
      </HeroText>
      <Description variant="body1" textAlign="center">
        Make twice no more. All you’ll ever need for frontend development. A
        hackable tool designed for hackers.
      </Description>
      <LandingMainCtaButton />

      <ElevatedVideoPlayer />

      <BlankArea height={[273, 200]} />
    </SectionLayout>
  );
};

export default Hero;

const HeroText = styled(LandingpageText)`
  max-width: 920px;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    max-width: 728px;
  }
`;

const Description = styled(LandingpageText)`
  max-width: 800px;
  margin-top: 40px;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 100%;
    line-height: 22px;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    max-width: 570px;
  }
`;
