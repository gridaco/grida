import styled from "@emotion/styled";
import LandingpageText from "components/landingpage/text";
import SectionLayout from "layouts/section";
import React from "react";
import { Button, Flex } from "theme-ui";

export default function SectionFinalCta() {
  return (
    <SectionLayout alignContent="center">
      <Flex style={{ width: "100%" }}>
        <Flex style={{ width: "50%", flexDirection: "column" }}>
          <LandingpageText variant="h1">
            Ready to go world wide?
          </LandingpageText>
          <CTAButton mt="50px">Request a private demo</CTAButton>
        </Flex>
        <Flex
          style={{
            width: "50%",
          }}
        ></Flex>
      </Flex>
    </SectionLayout>
  );
}

const CTAButton = styled(Button)`
  max-width: 250px;
`;
