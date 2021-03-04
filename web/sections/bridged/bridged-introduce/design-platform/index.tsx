import React from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Image from 'next/image';
import Icon from 'components/icon';

const DesignPlatforms = () => {
  return (
    <Flex height="100%" flex={1} flexDirection="column" alignItems="flex-start" justifyContent="flex-end">
      <PlatformView className="no-drag">
        <Image src="/figma_live.png" width="904" height="565" />
        <PlatformPreview bg="#F3F3F3">

        </PlatformPreview>
      </PlatformView>
      <Box>
        <Icon name="bridged" width={24} height={24} mr="28px" />
        <Icon name="bridged" width={24} height={24} mr="28px" />
        <Icon name="bridged" width={24} height={24} mr="28px" />
        <Icon name="bridged" width={24} height={24} />
      </Box>
    </Flex>
  )
}

export default DesignPlatforms

const PlatformPreview = styled(Flex)`
  width: 440px;
  height: 540px;
  top: 15%;
  position: absolute;
  border-radius: 12px;
  left: 40%;

  @media (max-width: 800px) {
    width: 400px;
    height: 500px;
    top: 15%;
    left: 45%;
  }
`

const PlatformView = styled(Flex)`
  flex-direction: column;
  position: absolute;
  top: 10%;
  left: -38%;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.5));

  @media (max-width: 940px) {
    top: 5%;
    left: -50% !important;
  }

  @media (max-width: 800px) {
    top: 10%;
    left: -58% !important;
  }

  /* @media (max-width: 320px) {
    width: 526px;
    height: 423px;
    top: 5% !important;
    left: 10% !important;
  } */
`