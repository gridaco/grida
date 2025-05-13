import styled from "@emotion/styled";
import React, { useCallback } from "react";
import { Flex, Text, Heading } from "theme-ui";

import BlankArea from "components/blank-area";
import Icon from "components/icon";
import LandingpageText from "components/landingpage/text";
import { usePopupContext } from "utils/context/PopupContext";

import ResponsivePricingCell from "../pricing-cell";

interface FeatureProps {
  data: {
    id: string;
    title: string;
    feature: {
      name: string;
      price: Array<string | boolean>;
    }[];
  }[];
}

const FeatureListDesktopView: React.FC<FeatureProps> = ({ data }) => {
  const { addPopup, removePopup } = usePopupContext();

  const handleClickQuestionMark = useCallback(() => {
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
            className="cursor-pointer"
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
              What is extra usage fee?
            </LandingpageText>
            <BlankArea height={[48, 48]} />
            <LandingpageText variant="body1" textAlign="center">
              Extre usage fee is only for team plan. For free plan users, there
              are no ways to access more than capacity provided by default.
              You’ll need to change your plan to Team or above.
            </LandingpageText>
          </Flex>
        </Flex>
      ),
    });
  }, []);

  return (
    <Flex
      style={{
        flexDirection: "column",
        width: "100%",
      }}
    >
      <Header
        style={{
          width: "100%",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
        pb="26px"
        mb="30px"
      >
        <Heading
          style={{
            flex: 1,
            fontSize: "56px",
            color: "black",
            fontWeight: "bold",
          }}
        >
          Features
        </Heading>
        <Flex
          style={{
            flex: 1,
          }}
        >
          <HeaderContent
            style={{
              flex: 1,
            }}
          >
            Free
          </HeaderContent>
          <HeaderContent
            style={{
              flex: 1,
            }}
          >
            Team
          </HeaderContent>
          <HeaderContent
            style={{
              flex: 1,
              alignItems: "center",
            }}
          >
            Extra usage
            <Icon
              className="cursor-pointer"
              onClick={handleClickQuestionMark}
              name="questionMark"
              ml="5px"
              isVerticalMiddle
              width={17.5}
              height={17.5}
            />
          </HeaderContent>
        </Flex>
      </Header>

      <Flex
        style={{
          width: "100%",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {data.map((item, ix) => (
          <Flex
            key={ix}
            mb="60px"
            style={{
              flexDirection: "column",
            }}
          >
            <Text
              mb="24px"
              color="black"
              style={{
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              {item.title}
            </Text>
            <Flex
              style={{
                flexDirection: "column",
              }}
            >
              {item.feature.map((item, ix) => (
                <ContentsWrapper mb="12px" key={ix}>
                  <Flex
                    style={{
                      fontSize: "18px",
                      color: "#2b2b2b",
                      flex: 3,
                    }}
                  >
                    {item.name}
                  </Flex>
                  <ResponsivePricingCell
                    style={{ flex: 1 }}
                    price={item.price[0]}
                  />
                  <ResponsivePricingCell
                    style={{ flex: 1 }}
                    price={item.price[1]}
                  />
                  <ResponsivePricingCell
                    style={{ flex: 1 }}
                    price={item.price[2]}
                  />
                </ContentsWrapper>
              ))}
            </Flex>
          </Flex>
        ))}
        {/* <Text mb="24px" color="#000000" fontSize="16px" fontWeight="bold">
          View all
          <Icon name="arrowDown" ml="10px" isVerticalMiddle />
        </Text> */}
      </Flex>
    </Flex>
  );
};

const Header = styled(Flex)`
  border-bottom: 1px solid #f8f8f8;
`;

const HeaderContent = styled(Flex)`
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
