import React, { useCallback, useState } from "react";
import { Flex, Text } from "theme-ui";
import styled from "@emotion/styled";
import Icon from "components/icon";
import LandingpageText from "components/landingpage/text";
import BlankArea from "components/blank-area";
import { usePopupContext } from "utils/context/PopupContext";

interface FeatureChoiceProps {
  titleList: string;
  featureData: any;
}

const FeatureChoice: React.FC<FeatureChoiceProps> = props => {
  const { titleList, featureData } = props;
  const [isOpen, setIsOpen] = useState([]);
  const { addPopup, removePopup } = usePopupContext();

  const handleFeatureClick = (idx: number) => {
    setIsOpen(d => {
      if (d.indexOf(idx) != -1) {
        d.splice(d.indexOf(idx), 1);
        return [...d.filter((item, index) => d.indexOf(item) === index)];
      } else {
        return [...d.filter((item, index) => d.indexOf(item) === index), idx];
      }
    });
  };

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
            className="cursor"
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
        width: "100%",
        alignItems: "center",
      }}
      mb="58px"
    >
      <Flex
        style={{
          flexDirection: "column",
        }}
      >
        <Text
          mt="17px"
          mb="33px"
          style={{
            fontSize: "18px",
          }}
          color="#7e7e7e"
        >
          {titleList}{" "}
          {titleList === "Extra Usage" && (
            <Icon
              className="cursor"
              onClick={handleClickQuestionMark}
              isVerticalMiddle
              name="questionMark"
            />
          )}
        </Text>
        {featureData.map((item, ix) => (
          <Item
            key={ix}
            style={{
              flexDirection: "column",
            }}
            onClick={() => handleFeatureClick(ix)}
            className="cursor"
            mb="36px"
          >
            <Text
              style={{
                fontWeight: "bold",
                fontSize: "16px",
              }}
              color="#000000"
            >
              {item.title}
            </Text>
            <Text
              color="#2b2b2b"
              style={{
                fontWeight: "normal",
              }}
            >
              {item.feature.map((i, idx) => (
                <Feature
                  key={idx}
                  style={{
                    width: "100%",
                  }}
                >
                  {isOpen.includes(ix) && <Flex mb="12px">{i.name}</Flex>}
                </Feature>
              ))}
            </Text>
          </Item>
        ))}

        {/* <Text className="cursor" fontSize="16px" fontWeight="bold">
          View all <Icon name="arrowDown" isVerticalMiddle />
        </Text> */}
      </Flex>
    </Flex>
  );
};

const Item = styled(Flex)`
  &:last-child {
    margin-bottom: 0px;
  }
`;

const Feature = styled(Flex)`
  &:first-of-type {
    margin-top: 24px;
  }

  &:last-child {
    margin-bottom: 0px;
  }
`;

export default FeatureChoice;
