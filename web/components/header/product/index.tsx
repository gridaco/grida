import styled from "@emotion/styled";
import React from "react";
import { Box, Flex, Text } from "rebass";

import Icon from "components/icon";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

const Product = ({ title, iconName, desc, href }) => {
  return (
    <a href={href}>
      <ProductWrapper
        width="100%"
        height="100%"
        justifyContent="center"
        flexDirection="column"
        mt="12px"
      >
        <Flex alignItems="center" mb="11px">
          <Icon name={iconName} />
          <Text fontWeight="500" fontSize="16px" ml="9px">
            {title}
          </Text>
        </Flex>
        {desc && (
          <Text color="#8B8B8B" fontSize="14px">
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

  :hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  transition: all 0.2s ease-in-out;
`;
