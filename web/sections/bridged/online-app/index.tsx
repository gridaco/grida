import React, { useEffect, useState } from 'react'
import SectionLayout from 'layout/section'
import { Button, Flex, Heading, Text } from 'rebass'
import styled from '@emotion/styled';
import BlankArea from 'components/blank-area';
import { media } from 'utils/styled/media';
import { ThemeInterface } from 'utils/styled/theme';
import ActionItem from 'components/action-item';
import { LandingpageUrls } from 'utils/landingpage/constants';
import OnairButton from 'components/effect/onair-button';
import ApplicationPreview from 'layout/application-preview';
import { DesktopView, MobileView } from 'utils/styled/styles';
import { DesignToCode } from '..';
import Image from 'next/image';

interface OnlineAppProps {
  isMobile?: boolean
}

const OnlineApp: React.FC<OnlineAppProps> = ({ isMobile }) => {
  const [assetUrl, setAssetUrl] = useState("/assets/gradient-bg.png");

  useEffect(() => {
    if (isMobile) {
      setAssetUrl("/assets/mobile/mobile-gradient-blur-sm.png");
    } else {
      setAssetUrl("/assets/gradient-bg.png");
    }
  }, [isMobile])

  return (
    <SectionLayout alignContent="start" backgroundColor="rgba(0,0,0,0)">
      <DesignToCode />
      <BlankArea height={150} />
      <Flex justifyContent="space-between" width="100%">
        <Flex flexDirection="column">
          <BlankArea height={75} />
          <Text fontSize="24px" mb="15px">What you’ve just sketched?</Text>
          <OnlineTitle fontSize={["32px", "36px", "36px", "36px"]}>
            <span>That just got</span> <OnairButton />
          </OnlineTitle>
          <MobileView style={{ marginTop: 40, position: "relative" }}>
            <ApplicationPreview />
            <div className="gradient-view no-drag">
              <Image src="/assets/mobile/mobile-gradient-blur-xs.png" alt="gradient" width="768" height="520" />
            </div>
          </MobileView>
          <Description fontSize={["18px", "21px", "21px", "24px"]}>Design to Code Feature supports Major design tools including Sketch, Figma and Adobe XD. Code is converted to Major Platforms / Languages / Frameworks with various coding styles. These lines of code is ready to use. Design once, Run everywhere</Description>

          <BlankArea height={50} />

          <ActionItem
            label="How do Design to code work?"
            href={LandingpageUrls.article_how_do_design_to_code_work}
          />
          <ActionItem
            label="Try the demo"
            href={LandingpageUrls.try_the_demo_1}
          />
        </Flex>
        <DesktopView style={{ position: "relative"}}>
          <ApplicationPreview />
          <div className="gradient-view no-drag">
            <Image src={assetUrl} alt="gradient" width="1040" height="1027" />
          </div>
        </DesktopView>
      </Flex>
      <BlankArea height={100} />
    </SectionLayout>
  )
}


export default OnlineApp

const OnlineTitle = styled(Heading)`
  display: flex;
  align-items: center;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    align-items: flex-start;
    flex-direction: column;
  }
`

const Description = styled(Text)`
  max-width: 520px;
  margin-top: 40px;
  color: #444545;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    max-width: 280px;
  }
`