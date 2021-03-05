import React from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Link from 'next/link';
import Image from 'next/image';
import Icon from 'components/icon';

const MotionIcon = styled(Icon)`
    position: absolute;
    top: -4%;
    left: -20%;

    @media (max-width: 1025px) {
        top: -40%;
        left: -2%;

        svg {
            width: 64px;
            height: 64px;
        }
    }

    @media (max-width: 760px) {
        top: -65%;
        left: -5%;

        svg {
            width: 64px;
            height: 64px;
        }
    }

    @media (max-width: 426px) {
        top: -65%;
        left: -5%;

        svg {
            width: 64px;
            height: 64px;
        }
    }
`

const BridgedCollaborate = () => {
    return (
        <React.Fragment>
            <CollaborateWrapper alignItems="center" justifyContent="center">
                <Flex width={["320px", "730px", "985px", "1040px"]} mt="auto" mx="20px" alignItems="center" justifyContent="center" flexDirection="column">
                    <Box mr="auto" style={{ position: 'relative' }}>
                        <MotionIcon name="loading" />
                        <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >Collaborate</Text>
                        <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >as the</Text>
                        <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >way it should be</Text>
                    </Box>

                    <Desc mr="auto" mt="35px">Create your products effecient, fast, and the way it makes sence liike never befor. //Using prototyping tools. Once modified, your work gets broken... Who wants that? Design with Bridged, which lasts. Designed your screen, connected a button, watched it work on your phone. But production? That’s just starting from scratch</Desc>
                </Flex>
            </CollaborateWrapper>
            <Bottom width="100%" height="850px" mt="90px">
                <BottomImage>
                    <Image src="/final_bg.png" width="auto" height="auto" />
                </BottomImage>
                <DemoApp>
                    <Image src="/dummy_img.png" width="auto" height="auto" />
                </DemoApp>
                <NotiImages>
                    <Notification top={20} right={0}>
                        <Image src="/noti3.png" width="auto" height="auto" />
                    </Notification>
                    <Notification top={10} right={10}>
                        <Image src="/noti2.png" width="auto" height="auto" />
                    </Notification>
                    <Notification top={1} right={20}>
                        <Image src="/noti1.png" width="auto" height="auto" />
                    </Notification>
                </NotiImages>
            </Bottom>
        </React.Fragment>
    )
}

export default BridgedCollaborate

const Bottom = styled(Box)`
    position: relative;

    @media (max-width: 376px) {
        height: 750px;
    }
    
`

const NotiImages = styled(Box)`
    position: absolute;
    top: 2.5%;
    right: 17.5%;
    width: 690px;
    height: 225px;

    @media (min-width: 1442px) {
        right: 5%;
    }

    @media (max-width: 1441px) {
        right: -2.5%;
    }

    @media (max-width: 1025px) {
        right: -22%;
    }

    @media (max-width: 769px) {
        right: -30%;
    }

    @media (max-width: 426px) {
        top: 7.5%;
        right: -80%;
    }

    @media (max-width: 376px) {
        top: 5%;
        right: -95%;
    }

    @media (max-width: 321px) {
        top: 20%;
        right: -130%;
    }
`

const Notification = styled(Box) <{ top: number, right: number }>`
    width: 100%;
    top: 0px;
    position: absolute;
    top : ${p => p.top}px;
    right : ${p => p.right}px;

    div {
        width: 690px;
        height: 225px;
    }

    @media (max-width: 1025px) {

        div {
            width: 500px;
            height: 160px;
        }
    }

    @media (max-width: 426px) {

        div {
            width: 400px;
            height: 120px;
        }
    }

    @media (max-width: 321px) {

        div {
            width: 300px;
            height: 90px;
        }
    }
`

const DemoApp = styled(Box)`
    position: absolute;
    bottom: -35%;
    left: 30%;

    @media (min-width: 1442px) {
        left: 18%;
    }

    @media (max-width: 1441px) {
        left: 12.5%;
    }
    

    div {
        width: 515px;
        height: 1040px;
    }

    @media (max-width: 500px) {
        bottom: -20%;
        left: 20%;

        div {
            width: 280px;
            height: 600px;
        }
    }

    @media (max-width: 1025px) {
        bottom: -35%;
        left: 0%;
    }

    @media (max-width: 768px) {
        left: 2.5%;
        bottom: -25%;
        div {
            width: 380px;
            height: 800px;
        }
    }

    @media (max-width: 376px) {
        left: 9%;
        bottom: -20%;

        div {
            width: 320px;
            height: 600px;
        }
    }

    @media (max-width: 321px) {
        left: 6%;
        bottom: -20%;
        div {
            width: 280px;
            height: 600px;
        }
    }
`

const BottomImage = styled(Box)`
    width: 100%;
    height: 100%;

    div {
        width: 100%;
        height: 100%;
    }
`

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