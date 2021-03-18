import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { Flex, Text, Heading } from "rebass";
import Icon from "components/icon";
import SectionLayout from "layout/section";
import { usePopupContext } from "utils/context/PopupContext";
import { defaultTheme } from "utils/styled";
import { useWindowWidth } from "utils/hooks/use-window-width";
import LandingpageText from "components/landingpage/text";

interface FeatureProps {
  data: {
    id: number;
    title: string;
    feature: {
      id: number;
      name: string;
      price: string[];
    }[];
  }[];
}

function replaceStylePxToNumber(stylePx: string) {
  return parseInt(stylePx.replace("px", ""));
}

const FeatureListDesktopView: React.FC<FeatureProps> = ({ data }) => {
  const { addPopup, removePopup } = usePopupContext();
  const width = useWindowWidth();

  const handleClickQuestionMark = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <Popup width="100%" alignItems="center" px="48px" pt="48px" pb="96px">
          {width > replaceStylePxToNumber(defaultTheme.breakpoints[0]) && (
            <Icon
              name="faqClose"
              ml="auto"
              onClick={() => removePopup()}
              style={{ cursor: "pointer" }}
            />
          )}

          <Flex
            width="100%"
            alignItems="center"
            px={["20px", "96px", "96px", "96px"]}
            flexDirection="column"
          >
            <LandingpageText textAlign="center" variant="h4">
              What is extra usage fee?
            </LandingpageText>
            <LandingpageText variant="body1">
              Extre usage fee is only for team plan. For free plan users, there
              are no ways to access more than capacity provided by default.
              You’ll need to change your plan to Team or above.
            </LandingpageText>
          </Flex>
        </Popup>
      ),
    });
  }, []);

  return (
    <Flex flexDirection="column" width="100%">
      <Header
        justifyContent="space-between"
        width="100%"
        alignItems="baseline"
        pb="26px"
        mb="30px"
      >
        <Heading flex="1" fontSize="56px" color="#000000" fontWeight="bold">
          Features
        </Heading>
        <Flex flex="1">
          <Content flex="1">Free</Content>
          <Content flex="1">Team</Content>
          <Content flex="1" alignItems="center">
            Extra usage
            <Icon
              onClick={handleClickQuestionMark}
              name="questionMark"
              ml="5px"
              isVerticalMiddle
              width={17.5}
              height={17.5}
            />
          </Content>
        </Flex>
      </Header>

      <Flex width="100%" flexDirection="column" justifyContent="space-between">
        {data.map((item, ix) => (
          <Flex key={ix} mb="60px" flexDirection="column">
            <Text mb="24px" color="#000000" fontSize="16px" fontWeight="bold">
              {item.title}
            </Text>
            <Flex flexDirection="column">
              {item.feature.map((item, ix) => (
                <ContentsWrapper mb="12px" key={ix}>
                  <Flex fontSize="18px" color="#2b2b2b" flex="3">
                    {item.name}
                  </Flex>
                  <Content flex="1">{item.price[0]}</Content>
                  <Content flex="1">{item.price[1]}</Content>
                  <Content flex="1">{item.price[2]}</Content>
                </ContentsWrapper>
              ))}
            </Flex>
          </Flex>
        ))}
        <Text mb="24px" color="#000000" fontSize="16px" fontWeight="bold">
          View all
          <Icon name="arrowDown" ml="10px" isVerticalMiddle />
        </Text>
      </Flex>
    </Flex>
  );
};

const Header = styled(Flex)`
  border-bottom: 1px solid #f8f8f8;
`;

const Content = styled(Flex)`
  font-weight: normal;
  font-size: 18px;
  text-align: center;
  justify-content: center;
  color: #7e7e7e;
`;

const ContentsWrapper = styled(Flex)`
  &:last-child {
    margin-bottom: 0px;
  }
`;

const Popup = styled(Flex)`
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 8px;
`;

export default FeatureListDesktopView;
