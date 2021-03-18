import styled from "@emotion/styled";
import Icon from "components/icon";
import LandingpageText from "components/landingpage/text";
import React from "react";
import { Button, Flex, Text } from "rebass";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

function PricingCard(props: {
  type: "paid" | "none-paid";
  planList: string[];
}) {
  return (
    <Wrapper type={props.type}>
      <Heading>
        <LandingpageText variant="h4">
          {props.type != "none-paid" ? "For you team" : "For you"}
        </LandingpageText>
        {props.type === "none-paid" && (
          <Icon className="cursor" name="questionMark" />
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
      <CardCTAButton className="cursor" type={props.type}>
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
