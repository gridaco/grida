import React from "react";
import SectionLayout from "layout/section";
import { Button, Heading, Text } from "rebass";
import styled from "@emotion/styled";
import BlankArea from "components/blank-area";
import { ElevatedVideoPlayer } from "components/effect";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import LandingMainCtaButton from "components/landingpage/main-cta-button";

const Hero = () => {
  return (
    <SectionLayout alignContent="center">
      <BlankArea height={[101, 198]} />
      <HeroText fontSize={["32px", "64px", "64px", "80px"]}>
        Designs that are meant to be implemented.
      </HeroText>
      <Description fontSize={["21px", "21px", "21px", "25px"]}>
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

const HeroText = styled(Heading)`
  text-align: center;
  letter-spacing: -0.03em;
  line-height: 97.1%;
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

const Description = styled(Text)`
  max-width: 800px;
  text-align: center;
  margin-top: 40px;
  color: #444545;
  line-height: 38px;
  font-weight: 400;
  letter-spacing: 0em;

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
