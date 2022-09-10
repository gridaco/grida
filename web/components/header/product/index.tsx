import styled from "@emotion/styled";
import React from "react";
import { Flex, Text } from "rebass";

import Icon, { IconKey } from "components/icon";

const Product = ({
  title,
  iconName,
  desc,
  href,
}: {
  title: string;
  iconName?: IconKey;
  desc: string;
  href: string;
}) => {
  return (
    <a href={href}>
      <ProductWrapper
        width="100%"
        height="100%"
        justifyContent="start"
        flexDirection="column"
        mt="12px"
      >
        <LabelContainer>
          {iconName && <Icon name={iconName} />}
          <Text fontWeight="500" fontSize="16px">
            {title}
          </Text>
        </LabelContainer>
        {desc && (
          <Text opacity={0.6} fontSize="14px">
            {desc}
          </Text>
        )}
      </ProductWrapper>
    </a>
  );
};

export default Product;

const ProductWrapper = styled(Flex)`
  cursor: pointer;
  padding: 12px 16px;
  border-radius: 2px;

  :hover {
    background-color: rgba(0, 0, 0, 0.03);
    opacity: 0.9;
  }

  transition: all 0.2s ease-in-out;
`;

const LabelContainer = styled(Flex)`
  gap: 9px;
  margin-bottom: 11px;
  align-items: center;
`;
