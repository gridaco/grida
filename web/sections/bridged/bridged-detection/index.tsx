import React from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Icon from 'components/icon';
import Link from 'next/link';
import { LandingpageUrls } from 'utils/landingpage/constants';
import ActionItem from 'components/action-item';

const BridgedDetection = () => {
    return (
        <DetectionWrapper alignItems="center" justifyContent="center" mx="20px">
            <Flex width={["320px", "730px", "985px", "1040px"]} alignItems="center" justifyContent="center" flexDirection="column">
                <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" mr="auto">Yes, we know.</Text>
                <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" mr="auto">That's a </Text>

                <Desc mr="auto" mt="48px">Finally, the tool understands your design. More inteligence means less modification. Which leads us to blazing fast workflow.</Desc>

                <Box width="100%" height="600px" mt="90px" bg="#000" mb="100px" />

                <ActionItem href={LandingpageUrls.article_how_engine_works} label="Learn how the engine works" />
            </Flex>

        </DetectionWrapper>
    )
}

export default BridgedDetection

const DetectionWrapper = styled(Flex)`
    height: 1400px;

     @media (max-width: 767px) {
        height: 1300px;
    }
`

const Desc = styled(Text)`
    max-width: 520px;
    font-size: 24px;
    color: #444545;

    @media (max-width: 767px) {
        max-width: 280px;
    }
`