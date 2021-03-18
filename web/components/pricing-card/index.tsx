import styled from "@emotion/styled";
import BlankArea from "components/blank-area";
import Icon from "components/icon";
import LandingpageText from "components/landingpage/text";
import Link from "next/link";
import React, { useCallback } from "react";
import { Button, Flex, Text } from "rebass";
import { usePopupContext } from "utils/context/PopupContext";
import { useWindowWidth } from "utils/hooks/use-window-width";
import { LandingpageUrls } from "utils/landingpage/constants";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

function PricingCard(props: {
  type: "paid" | "none-paid";
  planList: string[];
}) {
  const { addPopup, removePopup } = usePopupContext();
  const width = useWindowWidth();

  const handleClickQuestionMark = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <Flex
          width="calc(100vw - 40px)"
          alignItems="center"
          flexDirection="column"
          p="48px"
        >
          <Icon
            className="cursor"
            name="headerClose"
            ml="auto"
            onClick={() => removePopup()}
          />
          <Flex width="80%" flexDirection="column" alignItems="center">
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
    addPopup({
      title: "",
      element: (
        <Flex
          width="calc(100vw - 40px)"
          alignItems="center"
          flexDirection="column"
          p="48px"
        >
          <Icon
            className="cursor"
            name="headerClose"
            ml="auto"
            onClick={() => removePopup()}
          />
          <Flex width="80%" flexDirection="column" alignItems="center">
            <LandingpageText variant="h4" textAlign="center">
              Woopsy.
            </LandingpageText>
            <BlankArea height={[48, 48]} />
            <LandingpageText variant="body1" textAlign="center">
              Bridged paid plans are disabled temporarily. Meanwhile, you can
              use our free plan which basically does the same.
              <Link href={LandingpageUrls.signup}>
                <span style={{ margin: "0px 5px", color: "#172AD7"}}>Sign up</span>
              </Link>
              here.
            </LandingpageText>
          </Flex>
        </Flex>
      ),
    });
  }, []);

  return (
    <Wrapper type={props.type}>
      <Heading>
        <LandingpageText variant="h4">
          {props.type != "none-paid" ? "For you team" : "For you"}
        </LandingpageText>
        {props.type === "none-paid" && (
          <Icon
            className="cursor"
            name="questionMark"
            onClick={handleClickQuestionMark}
          />
        )}
      </Heading>
      <PlanPricing>
        <LandingpageText variant="h4">
          {props.type != "none-paid" ? "$20" : "$0"}
        </LandingpageText>
        {props.type != "none-paid" && <Seat variant="body1">per seats/mo</Seat>}
      </PlanPricing>
      <PlanDescription>
        {props.planList.map(i => (
          <div className="planlist">
            <div className="icon">
              <Icon name="check" />
            </div>
            <span className="desc">{i}</span>
          </div>
        ))}
      </PlanDescription>
      <CardCTAButton
        className="cursor"
        type={props.type}
        onClick={() => props.type != "none-paid" && handleClickPaidPlan()}
      >
        {props.type === "none-paid" ? "Start now" : "Start 14 Day Trial"}
      </CardCTAButton>
    </Wrapper>
  );
}

export default PricingCard;

const Wrapper = styled(Flex)`
  border-radius: 8px;
  border-radius: 8px;
  margin: 27px;
  padding: 40px;
  flex-direction: column;

  ${p => {
    if (p.type === "paid") {
      return {
        width: "100%",
        height: "100%",
        boxShadow: "0px 4px 128px 32px rgba(0, 0, 0, 0.08)",
        backgroundColor: "#fff",
      };
    } else if (p.type === "none-paid") {
      return {
        width: "90%",
        height: "90%",
        backgroundColor: "#FCFCFC",
        border: "1px solid #F7F7F7",
      };
    }
  }}

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    width: 100%;
  }
`;

const PlanPricing = styled(Flex)`
  margin-top: 36px;
  align-items: center;
`;

const Seat = styled(LandingpageText)`
  margin-left: 10px;
`;

const CardCTAButton = styled(Button)`
  margin-top: auto;
  border-radius: 4px;
  margin-top: 40px;
  cursor: pointer;
  ${p => {
    if (p.type === "paid") {
      return {
        backgroundColor: "#D2D2D2",
      };
    }
  }}
`;

const PlanDescription = styled(Flex)`
  flex-direction: column;
  height: 100%;
  .planlist {
    flex: 1;
    display: flex;
    align-items: center;

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      margin-right: 8px;
    }

    .desc {
      flex: 1;
      font-size: 18px;
      color: #535353;
    }

    ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
      flex: none;
      margin-top: 16px;
    }
  }
`;

const Heading = styled(Flex)`
  align-items: center;
  justify-content: space-between;
`;
