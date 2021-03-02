import React from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Link from 'next/link';


const BridgedIntroduce = () => {
  return (
    <IntroduceWrapper alignItems="center" justifyContent="center">
      <Flex width={["320px", "730px", "985px", "1040px"]}  mx="20px" alignItems="center" justifyContent="center" flexDirection="column">
        <Box mr="auto">
          <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >Designs,</Text>
          <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >come to live.</Text>

          <Desc mr="auto" mt="30px">Keep you design live, not as a prototype, but as a product. Instantly convert your design to code, prototype, product within a click. No coding required</Desc>
        </Box>
      </Flex>
    </IntroduceWrapper>
  )
}

export default BridgedIntroduce


const IntroduceWrapper = styled(Flex)`
    height: 2000px;
`

const Desc = styled(Text)`
    max-width: 520px;
    font-size: 21px;
    color: #444545;

    @media (max-width: 767px) {
        max-width: 280px;
    }
`