import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { Flex, Heading, Text } from "theme-ui";
import Icon from "components/icon";
import SectionLayout from "layouts/section";
import BlankArea from "components/blank-area";
import { media } from "utils/styled/media";
import LandingpageText from "components/landingpage/text";
import PricingCard from "components/pricing-card";
import { usePopupContext } from "utils/context/PopupContext";
import { LandingpageUrls } from "utils/landingpage/constants";

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
  const { addPopup, removePopup } = usePopupContext();
  const onFreeHelpClick = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <Flex
          style={{
            width: "calc(100vw - 40px)",
            alignItems: "center",
            flexDirection: "column",
          }}
          p="48px"
        >
          <Icon
            className="cursor"
            name="headerClose"
            ml="auto"
            onClick={() => removePopup()}
          />
          <Flex
            style={{
              width: "80%",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <LandingpageText variant="h4" textAlign="center">
              What are the limitations of free plan?
            </LandingpageText>
            <BlankArea height={[48, 48]} />
            <LandingpageText variant="body1" textAlign="center">
              To build an enterprise level application, you’ll need a paid plan.
              Paid plan includes extra default storage and unlimited projects
              count. Also cloud objects such as translation token can be stored
              up to 1 million. The extra usage will be charged as Standard Cloud
              Fee.
            </LandingpageText>
          </Flex>
        </Flex>
      ),
    });
  }, []);

  const handleClickPaidPlan = useCallback(() => {
    open("https://buy.stripe.com/bIY28petCa7e5YkcMP");
  }, []);

  const onFreeStartClick = () => {
    window.location.href = LandingpageUrls.signup_with_return;
  };

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
        <PricingCard
          name="For you"
          onHelp={onFreeHelpClick}
          price={0}
          features={PersonalPlanList}
          action="Start now"
          onStart={onFreeStartClick}
        />
        <PricingCard
          name="For you team"
          highlight
          price={{
            monthly: 25,
            yearly: 20,
          }}
          unitDescription={"per seat/mo"}
          features={TeamPlanList}
          action="Start 14 Day Trial"
          onStart={handleClickPaidPlan}
        />
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
