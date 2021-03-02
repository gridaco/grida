import React from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Link from 'next/link';

const BridgedCollaborate = () => {
    return (
        <React.Fragment>
            <CollaborateWrapper alignItems="center" justifyContent="center" >
                <Flex width={["320px", "730px", "985px", "1040px"]} mt="auto" mx="20px" alignItems="center" justifyContent="center" flexDirection="column">
                    <Box mr="auto">
                        <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >Collaborate</Text>
                        <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >as the</Text>
                        <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >way it should be</Text>
                    </Box>

                    <Desc mr="auto" mt="35px">Create your products effecient, fast, and the way it makes sence liike never befor. //Using prototyping tools. Once modified, your work gets broken... Who wants that? Design with Bridged, which lasts. Designed your screen, connected a button, watched it work on your phone. But production? That’s just starting from scratch</Desc>
                </Flex>
            </CollaborateWrapper>
            <Box width="100%" height="850px" mt="90px" bg="#7a7a7a" />
        </React.Fragment>
    )
}

export default BridgedCollaborate

const CollaborateWrapper = styled(Flex)`
    height: 500px;

     @media (max-width: 767px) {
        height: 600px;
    }
`

const Desc = styled(Text)`
    max-width: 520px;
    font-size: 21px;
    color: #444545;

    @media (max-width: 767px) {
        max-width: 280px;
    }
`