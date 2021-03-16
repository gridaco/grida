import React, { useState } from "react";
import { Flex, Text } from "rebass";
import styled from "@emotion/styled";
import Icon from "components/icon";

interface FeatureChoiceProps {
  titleList: string;
  featureData: any;
}

const FeatureChoice: React.FC<FeatureChoiceProps> = props => {
  const { titleList, featureData } = props;
  const [isOpen, setIsOpen] = useState([]);

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

  return (
    <Flex width="100%" backgroundColor="#ccc" alignItems="center" mb="58px">
      <Flex flexDirection="column">
        <Text mt="17px" mb="33px" fontSize="18px" color="#7e7e7e">
          {titleList}{" "}
          {titleList === "Extra Usage" && (
            <Icon isVerticalMiddle name="questionMark" />
          )}
        </Text>
        {featureData.map((item, ix) => (
          <Item
            flexDirection="column"
            onClick={() => handleFeatureClick(ix)}
            style={{ cursor: "pointer" }}
            mb="36px"
            key={item.id}
          >
            <Text fontWeight="bold" fontSize="16px" color="#000000">
              {item.title}
            </Text>
            <Text color="#2b2b2b" fontWeight="normal">
              {item.feature.map((i, idx) => (
                <Feature width="100%" key={i.id}>
                  {isOpen.includes(ix) && (
                    <Flex mb="12px" width="62%">
                      {i.name}
                    </Flex>
                  )}
                </Feature>
              ))}
            </Text>
          </Item>
        ))}

        <Text fontSize="16px" fontWeight="bold" style={{ cursor: "pointer" }}>
          View all <Icon name="arrowDown" isVerticalMiddle />
        </Text>
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
