import React from "react";
import styled from "@emotion/styled";
import { Flex, Text, Heading, Button } from "theme-ui";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import { LandingpageUrls } from "utils/landingpage/constants";

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
  const onFreeStartClick = () => {
    window.location.href = LandingpageUrls.signup_with_return;
  };

  return (
    <Card
      style={{
        width: "100%",
        height: "368px",
      }}
      sx={{
        flexDirection: ["column", "row", "row", "row"],
      }}
      backgroundColor="#ffffff"
    >
      <LeftWrapper
        sx={{
          width: ["100%", "50%", "50%", "50%"],
        }}
        style={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Flex
          style={{
            width: "100%",
            height: "256px",
            alignItems: "center",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {descList.map((item, ix) => (
            <Flex key={ix} mr="auto" ml="20px">
              <div>
                <Icon style={{ flex: 1 }} name="okaySign" />
              </div>
              <Desc
                style={{
                  flex: 3,
                  width: "90%",
                  fontSize: "18px",
                }}
                ml="10px"
                color="#5e5e5e"
              >
                {item.title}
              </Desc>
            </Flex>
          ))}
        </Flex>
      </LeftWrapper>
      <RightWrapper
        sx={{
          width: ["100%", "50%", "50%", "50%"],
        }}
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Flex
          style={{
            alignItems: "baseline",
          }}
          mb="24px"
        >
          <Heading
            style={{
              fontSize: "56px",
              letterSpacing: "0em",
            }}
            color="#000000"
          >
            $0
          </Heading>
          <Text
            color="#636363"
            style={{
              letterSpacing: "0em",
              fontSize: "42px",
            }}
            ml="4px"
          >
            /mo
          </Text>
        </Flex>
        <Button
          sx={{
            width: ["232px", "337px", "337px", "337px"],
            height: "46px",
            fontSize: "18px",
            fontWeight: "bold",
            border: "1px solid #93b1ff",
          }}
          color="#ffffff"
          variant="secondary"
          mb="40px"
          onClick={onFreeStartClick}
        >
          Start now
        </Button>
        <NoCredit
          style={{
            fontSize: "18px",
          }}
          color="#575757"
        >
          No credit card required
        </NoCredit>
      </RightWrapper>
    </Card>
  );
};

export default StartNow;

const Card = styled(Flex)`
  box-shadow: 0px 4px 64px 12px rgba(0, 0, 0, 0.08);
  border-radius: 8px;

  ${props => media("0px", props.theme.breakpoints[0])} {
    height: 686px;
  }
`;

const LeftWrapper = styled(Flex)`
  ${props => media("0px", props.theme.breakpoints[0])} {
    height: 50%;
  }
`;

const RightWrapper = styled(Flex)`
  ${props => media("0px", props.theme.breakpoints[0])} {
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
