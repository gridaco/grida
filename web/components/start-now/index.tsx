import React from "react";
import styled from "@emotion/styled";
import { Flex, Text, Heading, Button } from "rebass";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

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

const StartNow: React.FC = () => {
  return (
    <Card
      width="100%"
      height="368px"
      flexDirection={["column", "row", "row", "row"]}
    >
      <LeftWrapper
        width={["100%", "50%", "50%", "50%"]}
        alignItems="center"
        justifyContent="center"
      >
        <DescWrapper
          width="100%"
          height="256px"
          alignItems="center"
          flexDirection="column"
          justifyContent="space-between"
        >
          {descList.map((item, ix) => (
            <Desc ml="10px" width="90%" key={ix}>
              <Icon mr="16px" name="okaySign" />
              {item.title}
            </Desc>
          ))}
        </DescWrapper>
      </LeftWrapper>
      <RightWrapper
        width={["100%", "50%", "50%", "50%"]}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Flex alignItems="baseline" mb="24px">
          <Zero>$0</Zero>
          <Month ml="4px">/mo</Month>
        </Flex>
        <StartButton
          width={["232px", "337px", "337px", "337px"]}
          variant="secondary"
          mb="40px"
        >
          Start now
        </StartButton>
        <NoCredit>No credit card required</NoCredit>
      </RightWrapper>
    </Card>
  );
};

export default StartNow;

const Card = styled(Flex)`
  background: #ffffff;
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

const DescWrapper = styled(Flex)``;

const Desc = styled(Flex)`
  font-size: 18px;
  letter-spacing: 0em;
  text-align: left;

  color: #5e5e5e;
`;

const Zero = styled(Heading)`
  font-size: 56px;
  letter-spacing: 0em;
  line-height: 135%;

  color: #000000;
`;

const Month = styled(Text)`
  font-size: 42px;
  line-height: 135%;

  color: #636363;
  letter-spacing: 0em;
`;

const StartButton = styled(Button)`
  height: 46px;
  font-size: 18px;
  font-weight: bold;
  line-height: 22px;

  color: #ffffff;
  border: 1px solid #93b1ff;
`;

const NoCredit = styled(Flex)`
  font-size: 18px;
  letter-spacing: 0em;
  text-align: left;
  line-height: 135%;

  color: #575757;
`;
