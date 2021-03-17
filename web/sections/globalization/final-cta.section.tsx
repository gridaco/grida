import styled from "@emotion/styled";
import LandingpageText from "components/landingpage/text";
import SectionLayout from "layout/section";
import React from "react";
import { Button, Flex } from "rebass";
export default function SectionFinalCta() {
  return (
    <SectionLayout alignContent="center">
      <Flex width="100%">
        <Flex width="50%" flexDirection="column">
          <LandingpageText variant="h1">
            Ready to go world wide?
          </LandingpageText>
          <CTAButton mt="50px">Request a private demo</CTAButton>
        </Flex>
        <Flex width="50%"></Flex>
      </Flex>
    </SectionLayout>
  );
}

const CTAButton = styled(Button)`
  max-width: 250px;
`;
