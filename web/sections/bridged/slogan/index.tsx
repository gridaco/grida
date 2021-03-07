import Icon from 'components/icon'
import SectionLayout from 'layout/section'
import React from 'react'
import { Button, Flex, Heading } from 'rebass'
import styled from '@emotion/styled';
import LandingMainCtaButton from 'components/landingpage/main-cta-button';


const Slogan = () => {
  return (
    <SectionLayout variant="full-width" alignContent="center" backgroundColor="#000">
      <Flex flexDirection="column" alignItems="center" my={["120px", "300px"]} style={{ zIndex: 5 }}>
        <SloganText fontSize={["32px", "64px", "64px", "80px"]}>Focus on the Core</SloganText>
        <SloganText fontSize={["32px", "64px", "64px", "80px"]}>
          <Icon name="bridged" width={[32, 64]} height={[32, 64]} isVerticalMiddle mr={[12, 28]} /> will do the rest
        </SloganText>
        <LandingMainCtaButton/>
      </Flex>
    </SectionLayout>
  )
}

export default Slogan

const SloganText = styled(Heading)`
  color: #fff;
  text-align: center;
  path {
    fill: #fff;
  }
`