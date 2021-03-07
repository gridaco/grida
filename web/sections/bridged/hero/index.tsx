import React from 'react'
import SectionLayout from 'layout/section'
import { Button, Heading, Text } from 'rebass'
import styled from '@emotion/styled';
import BlankArea from 'components/blank-area';
import { ElevatedVideoPlayer } from 'components/effect';
import { media } from 'utils/styled/media';
import { ThemeInterface } from 'utils/styled/theme';

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
  max-width: 800px;
  text-align: center;
  margin-top: 40px;
  color: #444545;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 280px;
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[0], (props.theme as ThemeInterface).breakpoints[1])} {
    max-width: 570px;
  }
  
`