import React from 'react'
import SectionLayout from 'layout/section'
import { Button, Heading, Text } from 'rebass'
import styled from '@emotion/styled';
import BlankArea from 'components/blank-area';
import { ElevatedVideoPlayer } from 'components/effect';

const Hero = () => {
  return (
    <SectionLayout alignContent="center">
      <BlankArea height={75} />
      <HeroText fontSize={["32px", "64px", "64px", "80px"]}>Designs that are meant to be implemented.</HeroText>
      <Description fontSize={["21px", "21px", "21px", "24px"]}>Make twice no more. All you’ll ever need for frontend development. A hackable tool that's designed for hackers.</Description>
      <Button mt={["32px", "90px", "90px", "90px"]} mb="50px">Start now</Button>

      <ElevatedVideoPlayer />
      
      <BlankArea height={200} />
    </SectionLayout>
  )
}

export default Hero

const HeroText = styled(Heading)`
  text-align: center;
`

const Description = styled(Text)`
  text-align: center;
  margin-top: 40px;
  color: #444545;
`