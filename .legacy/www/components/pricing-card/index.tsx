import React from "react";
import styled from "@emotion/styled";
import { CheckIcon, QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import LandingpageText from "components/landingpage/text";
import { Button, Flex, Text } from "theme-ui";
import { media } from "utils/styled/media";

function PricingCard({
  normal,
  price,
  features,
  unitDescription,
  name,
  description,
  onHelp,
  onStart,
  highlight = false,
  action,
  style = {},
}: {
  features: string[];
  name: string;
  unitDescription?: string;
  description?: React.ReactNode;
  normal?: number;
  price:
  | {
    monthly: number;
    yearly: number;
  }
  | number;
  onHelp?: () => void;
  onStart?: () => void;
  highlight?: boolean;
  action: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const targetprice = typeof price === "number" ? price : price.yearly;
  const monthlyprice = typeof price === "number" ? price : price.monthly;
  const hasAnnualPromotion = typeof price === "number" ? false : !!price.yearly;

  return (
    <Wrapper data-highlight={highlight} style={style}>
      <Heading>
        <LandingpageText variant="h4">{name}</LandingpageText>
        {onHelp && (
          <QuestionMarkCircledIcon className="cursor-pointer" onClick={onHelp} />
        )}
      </Heading>
      <PlanPricing style={{ gap: 4 }}>
        {normal && (
          <LandingpageText strikeThrough variant="h4" opacity={0.4}>
            ${normal}
          </LandingpageText>
        )}
        <LandingpageText variant="h4">${targetprice}</LandingpageText>
        {unitDescription && <Seat variant="body1">{unitDescription}</Seat>}
      </PlanPricing>
      {hasAnnualPromotion && !!monthlyprice && (
        <AlternateBillingOptionDescription>
          Billed annually or ${monthlyprice} month-to-month
        </AlternateBillingOptionDescription>
      )}
      {description && description}
      <Flex
        style={{
          alignItems: "center",
          height: "100%",
        }}
        my={24}
      >
        <PlanDescription>
          {features.map(i => (
            <div className="planlist" key={i}>
              <CheckIcon className="icon" />
              <span className="desc">{i}</span>
            </div>
          ))}
        </PlanDescription>
      </Flex>
      <CtaButton
        className="cursor-pointer"
        style={{
          background: highlight ? undefined : "rgba(0, 0, 0, 0.9)",
        }}
        onClick={onStart}
      >
        {action}
      </CtaButton>
    </Wrapper>
  );
}

export default PricingCard;

const Wrapper = styled(Flex)`
  border-radius: 8px;
  padding: 40px;
  flex-direction: column;

  &[data-highlight="true"] {
    width: 100%;
    height: 100%;
    box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
    background: white;
  }

  &[data-highlight="false"] {
    width: 90%;
    height: 90%;
    background: #fcfcfc;
    border: 1px solid #f7f7f7;
  }

  ${props => media("0px", props.theme.breakpoints[0])} {
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

const CtaButton = styled(Button)`
  margin-top: auto;
  border-radius: 4px;
`;

const AlternateBillingOptionDescription = styled.span`
  margin-top: 8px;
  font-size: 14px;
  line-height: 20px;
  color: rgba(0, 0, 0, 0.5);
`;

const PlanDescription = styled(Flex)`
  flex-direction: column;

  .planlist {
    margin: 8px 0px;
    display: flex;
    align-items: center;

    .icon {
      color: #a9a9a9;
      width: 24px;
      height: 24px;
      margin-right: 8px;
    }

    .desc {
      font-size: 18px;
      flex: 1;
      font-size: 18px;
      color: #535353;
    }

    ${props => media("0px", props.theme.breakpoints[0])} {
      flex: none;
      margin-top: 16px;
    }
  }
`;

const Heading = styled(Flex)`
  align-items: center;
  justify-content: space-between;
`;
