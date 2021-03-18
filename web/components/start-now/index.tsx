import React from "react";
import styled from "@emotion/styled";
import { Flex, Text, Heading, Button } from "rebass";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import PricingCTAButton from "components/pricing-cta-button";

const descList = [
  {
    title: "Code export including Flutter, React and more",
  },
  {
    title: "Private git integration",
  },
  {
    title: "Design linting",
  },
  {
    title: "Unlimited public projects",
  },
  {
    title: "Up to 5000 Objects",
  },
];

// FUCKING NOT READY RESPONSIVE
const StartNow: React.FC = () => {
  return (
    <Card
      width="100%"
      height="368px"
      flexDirection={["column", "row", "row", "row"]}
      backgroundColor="#ffffff"
    >
      <LeftWrapper
        width={["100%", "50%", "50%", "50%"]}
        alignItems="center"
        justifyContent="center"
      >
        <Flex
          width="100%"
          height="256px"
          alignItems="center"
          flexDirection="column"
          justifyContent="space-between"
        >
          {descList.map((item, ix) => (
            <Desc ml="10px" width="90%" color="#5e5e5e" fontSize="18px" key={ix}>
              <Icon mr="16px" name="okaySign" />
              {item.title}
            </Desc>
          ))}
        </Flex>
      </LeftWrapper>
      <RightWrapper
        width={["100%", "50%", "50%", "50%"]}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Flex alignItems="baseline" mb="24px">
          <Heading fontSize="56px" letterSpacing="0em" color="#000000">$0</Heading>
          <Text color="#636363" letterSpacing="0em" fontSize="42px" ml="4px">/mo</Text>
        </Flex>
        <PricingCTAButton
          width={["232px", "337px", "337px", "337px"]}
          height="46px"
          fontSize="18px"
          fontWeight="bold"
          color="#ffffff"
          variant="secondary"
          border="1px solid #93b1ff"
          mb="40px"
        >
          Start now
        </PricingCTAButton>
        <NoCredit fontSize="18px" color="#575757">No credit card required</NoCredit>
      </RightWrapper>
    </Card>
  );
};

export default StartNow;

const Card = styled(Flex)`
  box-shadow: 0px 4px 64px 12px rgba(0, 0, 0, 0.08);
  border-radius: 8px;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    height: 686px;
  }
`;

const LeftWrapper = styled(Flex)`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    height: 50%;
  }
`;

const RightWrapper = styled(Flex)`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    height: 50%;
  }
`;

const Desc = styled(Flex)`
  letter-spacing: 0em;
  text-align: left;
`;

const NoCredit = styled(Flex)`
  letter-spacing: 0em;
  text-align: left;
`;
