import styled from "@emotion/styled";
import BlankArea from "components/blank-area";
import LandingpageText from "components/landingpage/text";
import SectionLayout from "layout/section";
import React from "react";
import { Button } from "rebass";

export default function GlobalizationHeroSection() {
  return (
    <SectionLayout alignContent="center">
      <BlankArea height={[150, 300]}/>
      <LandingpageText variant="h1" textAlign="center">
        Globalize your design.
      </LandingpageText>
      <Description variant="body1" textAlign="center">
        Manage your text, asset and logic based on your design.
      </Description>
      <Button mt="80px">Join the wait list</Button>
      <BlankArea height={[150, 300]}/>
    </SectionLayout>
  );
}

export const Description = styled(LandingpageText)``;
