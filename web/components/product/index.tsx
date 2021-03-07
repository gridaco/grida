import React from 'react'
import { Box, Flex, Text } from 'rebass';
import styled from '@emotion/styled';
import Icon from 'components/icon';
import { ThemeInterface } from 'utils/styled/theme';
import { media } from 'utils/styled/media';


const Product = ({ title, iconName, desc }) => {
  return (
    <ProductWrapper width="100%" height="100%" justifyContent="center" flexDirection="column" mt="12px">
      <Flex alignItems="center" mb="11px">
        <Icon name={iconName} />
        <Text fontWeight="500" fontSize="16px" ml="9px">{title}</Text>
      </Flex>
      <Text color="#8B8B8B" fontSize="14px" >{desc}</Text>
    </ProductWrapper>
  )
}

export default Product

const ProductWrapper = styled(Flex)`
  max-width: 255px;
  max-height: 70px;

  ${props => media(null, (props.theme as ThemeInterface).breakpoints[1])} {
    max-width: 320px;
  }
`