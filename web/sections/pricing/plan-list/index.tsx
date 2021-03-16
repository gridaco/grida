import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { Flex, Heading, Text, Button } from "rebass";
import SectionLayout from "layout/section";
import BlankArea from "components/blank-area";
import Icon from "components/icon";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import { usePopupContext } from "utils/context/PopupContext";

const forYouTitleList = [
  {
    title: "Private git integration",
  },
  {
    title: "Design linting",
  },
  {
    title: "0.5GB Asset Storage",
  },
  {
    title: "Code export",
  },
  {
    title: "Unlimited public projects",
  },
  {
    title: "Up to 5000 Objects",
  },
  {
    title: "1M Code blocks",
  },
];

const forTeamTitleList = [
  {
    title: "Unlimited Long-lived hosting",
  },
  {
    title: "Unlimited Private projects",
  },
  {
    title: "30GB Asset Storage",
  },
  {
    title: "Code generation with full-engine capability",
  },
  {
    title: "Unlimited Projects",
  },
  {
    title: "Custom Domain",
  },
  {
    title: "1M Cloud objects",
  },
  {
    title: "Unlimited Code blocks",
  },
];

const PlanList: React.FC = () => {
  const { addPopup, removePopup } = usePopupContext();

  const handleClickQuestionMark = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <FreePlanPopup pt="48px" pb="96px" px="48px">
          <Icon
            name="faqClose"
            ml="auto"
            onClick={() => removePopup()}
            style={{ cursor: "pointer" }}
          />
          <Flex alignItems="center" flexDirection="column">
            <Heading mb="48px" fontWeight="bold" fontSize="36px">
              What are the limitations of free plan?
            </Heading>
            <Text
              color="#686868"
              textAlign="center"
              lineHeight="43px"
              letterSpacing="0em"
              fontWeight="400"
              fontSize="24px"
            >
              To build an enterprise level application, you’ll need a paid plan.
              Paid plan includes extra default storage and unlimited projects
              count. Also cloud objects such as translation token can be stored
              up to 1 million. The extra usage will be charged as Standard Cloud
              Fee.
            </Text>
          </Flex>
        </FreePlanPopup>
      ),
      showOnlyBody: true,
      height: "50vw",
    });
  }, []);

  return (
    <SectionLayout alignContent="center">
      <BlankArea height={331} />
      <Title mb="43px">Pay as you grow</Title>
      <Desc mb={["69px", "185px", "145px", "159px"]}>
        Start small, pay when you’re ready.
      </Desc>
      <Wrapper
        width="100%"
        height="841px"
        alignItems="center"
        justifyContent={["space-between", "center", "center", "center"]}
        flexDirection={["column", "row", "row", "row"]}
      >
        <ForYou
          width="388px"
          height="567px"
          justifyContent="center"
          alignItems="center"
          mr={["0px", "27px", "27px", "27px"]}
          mb={["24px", "0px", "0px", "0px"]}
          backgroundColor="#fcfcfc"
        >
          <CardWrapper width="85%" height="90%" flexDirection="column">
            <CardTitle justifyContent="space-between" alignItems="center">
              For you
              <Icon
                onClick={handleClickQuestionMark}
                name="questionMark"
                isVerticalMiddle
                style={{ cursor: "pointer" }}
              />
            </CardTitle>
            <Text
              mb="33px"
              letterSpacing="0em"
              mt="24px"
              color="#000000"
              fontSize="36px"
            >
              $0
            </Text>
            {forYouTitleList.map((item, ix) => (
              <Flex fontSize="18px" color="#535353" mb="19px" key={ix}>
                <Icon mr="11px" name="check" />
                {item.title}
              </Flex>
            ))}
            <Button
              fontWeight="bold"
              mt="auto"
              width="100%"
              height="46px"
              variant="secondary"
            >
              Start now
            </Button>
          </CardWrapper>
        </ForYou>

        <ForTeam
          width="518px"
          height="761px"
          justifyContent="center"
          ml={["0px", "27px", "27px", "27px"]}
          backgroundColor="#ffffff"
        >
          <CardWrapper
            mt={["20px", "40px", "40px", "40px"]}
            height="90%"
            width="85%"
            flexDirection="column"
          >
            <CardTitle>For your team</CardTitle>
            <Flex
              mt={["16px", "36px", "36px", "36px"]}
              mb={["36px", "74px", "74px", "74px"]}
              alignItems="center"
            >
              <Text
                mr="7px"
                letterSpacing="0em"
                color="#000000"
                fontSize="36px"
                lineHeight="135%"
              >
                $24
              </Text>
              <Text color="rgba(109, 109, 109, 0.83);" fontSize="21px">
                per seats/mo
              </Text>
            </Flex>
            {forTeamTitleList.map((item, ix) => (
              <Flex fontSize="18px" color="#535353" mb="19px" key={ix}>
                <Icon mr="11px" name="check" />
                {item.title}
              </Flex>
            ))}
            <Button
              fontWeight="bold"
              mt="auto"
              width="100%"
              height="46px"
              variant="secondary"
            >
              Start 14 Day Trial
            </Button>
          </CardWrapper>
        </ForTeam>
      </Wrapper>
      <BlankArea height={264} />
    </SectionLayout>
  );
};

export default PlanList;

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
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    height: 1128px;
  }
`;

const ForYou = styled(Flex)`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    width: 90%;
    height: 527px;
  }
  border: 1px solid #f7f7f7;
  border-radius: 8px;
`;

const CardWrapper = styled(Flex)`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    height: 95%;
  }
`;

const CardTitle = styled(Flex)`
  font-size: 24px;
  line-height: 135%;

  color: #000000;
`;

const ForTeam = styled(Flex)`
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    width: 90%;
    height: 577px;
  }

  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  border-radius: 8px;
`;
