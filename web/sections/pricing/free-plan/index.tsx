import React from "react";
import styled from "@emotion/styled";
import { Flex, Heading, Text } from "rebass";
import SectionLayout from "layouts/section";
import StartNow from "components/start-now";
import BlankArea from "components/blank-area";

const FreePlan = () => {
  return (
    <SectionLayout alignContent="center">
      <BlankArea height={[221, 221]} />
      <FreeText mb="43px">Free for dreamers</FreeText>
      <Desc width="80%" mb="132px">
        Unlock your possibility, express your ideas faster then ever. Grida is
        free forever.
      </Desc>

      <StartNow />
      <BlankArea height={[195, 331]} />
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

const Desc = styled(Text)`
  font-size: 24px;
  line-height: 34px;
  letter-spacing: 0em;
  text-align: center;
  color: #707070;
`;
