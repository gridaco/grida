import React from "react";
import styled from "@emotion/styled";
import { Flex, Heading } from "rebass";
import SectionLayout from "layout/section";

const FreePlan = () => {
  return (
    <SectionLayout alignContent="center">
      {/* <Flex flexDirection="column">
        <FreeText>Free for dreamers</FreeText>
      </Flex> */}
    </SectionLayout>
  );
};

export default FreePlan;

const FreeText = styled(Heading)`
  font-size: 72px;
  color: #000000;

  text-align: center;
  letter-spacing: -0.025em;
`;
