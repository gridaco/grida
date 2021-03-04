import React, { useState } from 'react'
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Image from 'next/image';
import Icon from 'components/icon';

const renderPlatforms = ["figma", "sketch", "adobexd"]

const DesignPlatforms = () => {
  const [currentPlatform, setCurrentPlatform] = useState("figma");

  return (
    <Flex height="100%" flex={1} flexDirection="column" alignItems="flex-start" justifyContent="flex-end">
      <PlatformView className="no-drag">
        <Image src="/figma_live.png" width="904" height="565" />
        <PlatformPreview bg="#F3F3F3">

        </PlatformPreview>
      </PlatformView>
      <Platforms>
        {renderPlatforms.map(i => <Image key={i} className="cursor" onClick={() => setCurrentPlatform(i)} src={`/platform-icons/${i}/${currentPlatform === i ? "default" : "grey"}.png`} width="24" height="24"  />)}
      </Platforms>
    </Flex>
  )
}

export default DesignPlatforms

const Platforms = styled(Box)`
  div {
    width: 24px;
    height: 24px;
    margin-left: 28px !important;
  }
`

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

  @media (max-width: 720px) {
    width: 280px;
    height: 350px;
    top: 20%;
    left: -5%;
  }

  @media (max-width: 400px) {
    width: 280px;
    height: 350px;
    top: 20%;
    left: 0% !important;
  }

`

const PlatformView = styled(Flex)`
  flex-direction: column;
  position: absolute;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.5));

  @media (min-width: 940px) {
    top: 10%;
    left: -38%;
  }

  @media (max-width: 940px) {
    top: 5%;
    left: -50% !important;
  }

  @media (max-width: 800px) {
    top: 10%;
    left: -65% !important;
  }

  @media (max-width: 720px) {
    top: 5%;
    right: -20% !important;
    left: auto !important;

    img {
      width: 500px;
      height: 310px;
    }
  }

  @media (max-width: 400px) {

    img {
      width: 500px;
      height: 310px;
      top: 5%;
      right: -10% !important;
      left: auto !important;
    }
  }


  /* @media (max-width: 320px) {
    width: 526px;
    height: 423px;
    top: 5% !important;
    left: 10% !important;
  } */
`