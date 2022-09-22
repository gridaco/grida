import React from "react";
import styled from "@emotion/styled";
import { Flex, Heading, Text } from "theme-ui";
import SectionLayout from "layouts/section";
import BlankArea from "components/blank-area";
import { media } from "utils/styled/media";
import LandingpageText from "components/landingpage/text";
import PricingCard from "components/pricing-card";

const PersonalPlanList = [
  "Private git integration",
  "Design linting",
  "0.5GB Asset Storage",
  "Code export",
  "Unlimited public projects",
  "Up to 5000 Objects",
  "1M Code blocks",
];

const TeamPlanList = [
  "Unlimited Long-lived hosting",
  "Unlimited Private projects",
  "30GB Asset Storage",
  "Code generation with full-engine capability",
  "Unlimited Projects",
  "Custom Domain",
  "1M Cloud objects",
  "Unlimited Code blocks",
];

export default function PlanList() {
  return (
    <SectionLayout alignContent="center">
      <Title mb="43px">Pay as you grow</Title>
      <Desc mb={["69px", "185px", "145px", "159px"]}>
        Start small, pay when you’re ready.
      </Desc>
      <Wrapper
        style={{
          width: "100%",
          alignItems: "center",
        }}
        sx={{
          justifyContent: ["space-between", "center", "center", "center"],
          flexDirection: ["column", "row", "row", "row"],
        }}
      >
        <PricingCard type="none-paid" planList={PersonalPlanList} />
        <PricingCard type="paid" planList={TeamPlanList} />
      </Wrapper>
      <BlankArea height={[182, 264]} />
    </SectionLayout>
  );
}

const PopupDescription = styled(LandingpageText)`
  margin-top: 45px;
  text-align: center;
`;

const FreePlanPopup = styled(Flex)`
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 8px;
`;

const Title = styled(Heading)`
  font-weight: bold;
  font-size: 56px;
  line-height: 86.5%;

  text-align: center;
  letter-spacing: -0.025em;

  color: #000000;
`;

const Desc = styled(Text)`
  font-weight: normal;
  font-size: 24px;
  line-height: 141%;
  text-align: center;

  color: #686868;
`;

const Wrapper = styled(Flex)`
  max-height: 800px;
  height: 200vh;

  ${props => media("0px", props.theme.breakpoints[0])} {
    max-height: 1300px;
  }
`;
