import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { Flex, Heading, Text, Button } from "rebass";
import SectionLayout from "layout/section";
import BlankArea from "components/blank-area";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import defaultTheme, { ThemeInterface } from "utils/styled/theme";
import { usePopupContext } from "utils/context/PopupContext";
import { useWindowWidth } from "utils/hooks/use-window-width";
import Link from "next/link";
import { LandingpageUrls } from "utils/landingpage/constants";
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

function replaceStylePxToNumber(stylePx: string) {
  return parseInt(stylePx.replace("px", ""));
}

export default function PlanList() {
  const { addPopup, removePopup } = usePopupContext();
  const width = useWindowWidth();

  const handleClickQuestionMark = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <FreePlanPopup width="100%" alignItems="center" px="25px" pb="60px">
          {width >= replaceStylePxToNumber(defaultTheme.breakpoints[0]) && (
            <Icon
              name="faqClose"
              ml="auto"
              onClick={() => removePopup()}
              style={{ cursor: "pointer" }}
              mb="30px"
              mt="20px"
            />
          )}

          <Flex width="100%" alignItems="center" flexDirection="column">
            <LandingpageText textAlign="center" variant="h4">
              What are the limitations of free plan?
            </LandingpageText>
            <PopupDescription textAlign="center" variant="body1">
              To build an enterprise level application, you’ll need a paid plan.
              Paid plan includes extra default storage and unlimited projects
              count. Also cloud objects such as translation token can be stored
              up to 1 million. The extra usage will be charged as Standard Cloud
              Fee.
            </PopupDescription>
          </Flex>
        </FreePlanPopup>
      ),
    });
  }, []);

  const handleClickPaidPlan = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <FreePlanPopup
          width="100%"
          alignItems="center"
          px="24px"
          pt="24px"
          pb="48px"
        >
          {width >= replaceStylePxToNumber(defaultTheme.breakpoints[0]) && (
            <Icon
              name="faqClose"
              ml="auto"
              onClick={() => removePopup()}
              style={{ cursor: "pointer" }}
              mb="30px"
            />
          )}

          <Flex width="100%" alignItems="center" flexDirection="column">
            <LandingpageText textAlign="center" variant="h4">
              Woopsy.
            </LandingpageText>
            <PopupDescription textAlign="center" variant="body1">
              Bridged paid plans are disabled temporarily. Meanwhile, you can
              use our free plan which basically does the same.
              <Link href={LandingpageUrls.signup}>
                <span
                  className="cursor"
                  style={{ color: "#172AD7", margin: "0px 5px" }}
                >
                  Sign up
                </span>
              </Link>
              here.
            </PopupDescription>
          </Flex>
        </FreePlanPopup>
      ),
    });
  }, []);

  return (
    <SectionLayout alignContent="center">
      <Title mb="43px">Pay as you grow</Title>
      <Desc mb={["69px", "185px", "145px", "159px"]}>
        Start small, pay when you’re ready.
      </Desc>
      <Wrapper
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent={["space-between", "center", "center", "center"]}
        flexDirection={["column", "row", "row", "row"]}
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

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-height: 1300px;
  }
`;
