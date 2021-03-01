import Icon from 'components/icon'
import React from 'react'
import { Button, Flex, Text } from 'rebass'
import styled from '@emotion/styled';

const BridgedOuttro = () => {
    return (
        <OuttroWrapper width="100%" height="" bg="#000" alignItems="center" justifyContent="center" flexDirection="column">
            <Text color="#fff" fontWeight="bold" fontSize={["24px", "24px", "64px"]}>Focus on the Core.</Text>
            <TextDesc color="#fff" fontWeight="bold" fontSize={["24px", "24px", "64px"]} mt={["18px", "18px", "24px"]}><Icon name="bridged" width={[32, 32, 64]} height={[32, 32, 64]} isVerticalMiddle mr={[12, 12, 28]} /> will do the rest</TextDesc>
            <StartButton mt="95px" p={["12px 28px"]}>Start now</StartButton>
        </OuttroWrapper>
    )
}

export default BridgedOuttro

const TextDesc = styled(Text)`
    display: flex;
    align-items: center;
    justify-content: center;
    
    svg {
        path {
            fill: #fff !important;
        }
    }
`

const StartButton = styled(Button)`
    font-size: 18px;
    font-weight: bold;
`

const OuttroWrapper = styled(Flex)`
    height: 900px;

     @media (max-width: 767px) {
        height: 570px;
    }
`