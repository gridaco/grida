import React from 'react'
import Image from 'next/image';
import { Flex, Button, Text, Box } from 'rebass';
import styled from '@emotion/styled';
import Link from 'next/link';
import Icon from 'components/icon';


const BridgedIntroduce = () => {
  return (
    <IntroduceWrapper alignItems="center" justifyContent="center">
      <Flex width={["320px", "730px", "985px", "1040px"]} mx="20px" alignItems="center" justifyContent="center" flexDirection="column">
        <Box mr="auto">
          <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >Designs,</Text>
          <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" >come to live.</Text>

          <Desc mr="auto" mt="30px">Keep you design live, not as a prototype, but as a product. Instantly convert your design to code, prototype, product within a click. No coding required</Desc>
        </Box>
        <AbsoulteImageArea>
          <CodeView width="460px" height="770px" bg="#212121">
            <header>
              <span />
              <span />
              <span />
            </header>
            <div className="body">
              <main>
                Code section
              </main>
            </div>
            <Platforms mt="20px" justifyContent="flex-end">
              <span />
              <span />
              <span />
              <span />
            </Platforms>
          </CodeView>
        
          <PlatformView className="no-drag">
            <Image src="/figma_live.png" width="904" height="565" />
            <PlatformMotions>

            </PlatformMotions>
            <Platforms>

            </Platforms>
          </PlatformView>
        </AbsoulteImageArea>
        <Flex width="100%" justifyContent="space-between">
          <Box>
            <Text fontSize="24px" mb="17px">What you’ve just sketched?</Text>
            <Text fontSize={["36px", "36px", "64px"]} fontWeight="bold" mb="35px">That just got ON AIR</Text>
            <LiveAreaMobile className="no-drag">
              <Image className="app" src="/simluator.png" width="390" height="788" />
            </LiveAreaMobile>

            <Desc mr="auto" mb="70px" >Design to Code Feature supports Major design tools including Sketch, Figma and Adobe XD. Code is converted to Major Platforms / Languages / Frameworks with various coding styles. These lines of code is ready to use.</Desc>

            <Text fontSize="24px" mb="8px" color="#7D7D7D" >How do Design to code work? <Icon name="arrowDown" isVerticalMiddle style={{ transform: "rotate(270deg)" }} /></Text>
            <Text fontSize="24px" mb="8px" color="#7D7D7D">That just got ON AIR <Icon name="arrowDown" isVerticalMiddle style={{ transform: "rotate(270deg)" }} /></Text>
          </Box>
          <LiveAreaDesktop className="no-drag">
            <Image className="app" src="/simluator.png" width="390" height="788" />
            {/* <GradientView>
              <Image src="/gradient-live.png" width="1440" height="1040" />
            </GradientView> */}
          </LiveAreaDesktop>
        </Flex>
      </Flex>
    </IntroduceWrapper>
  )
}

export default BridgedIntroduce

const PlatformMotions = styled(Box)`
  width: 280px;
  height: 350px;
  background: #F3F3F3;
  border-radius: 12px;
  position: absolute;
  left: -5.5%;
  top: 15%;
`

const Platforms = styled(Flex)`
  height: 36px;

  span {
    width: 24px;
    height: 24px;
    background-color: #000;
    margin-left: 24px;
  }
`

const IntroduceWrapper = styled(Flex)`
    height: 2000px;

    @media (max-width: 320px) {
      height: 2500px;
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

const AbsoulteImageArea = styled(Box)`
  height: 900px;
  position: relative;
  width: 100%;

  @media (max-width: 320px) {
    display: flex;
    flex-direction: column;
    height: 1000px;
  }
`

const CodeView = styled(Box)`
  position: absolute;
  top: -27%;
  right: -15%;
  border-radius: 12px;

  @media (max-width: 768px) {
    top: -27%;
    right: -33% !important;
  }

  @media (max-width: 320px) {
    width: 280px;
    height: 410px;
    top: 45% !important;
    right: -0% !important;
  }
  
  header {
    display: flex;
    align-items: center;
    height: 50px;
    padding: 0px 20px;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;

    span {
      background-color:#3D3D3D;
      width: 16px;
      height: 16px;
      margin-right: 10px;
      border-radius: 50%;
    }
  }

  .body {
    width:100%;
    height: calc(100% - 50px);
    display: flex;
    align-items: center;
    justify-content: center;

    main {
      width: 95%;
      height: 95%;
      background-color: #fff;
    }
  }
  
`

const PlatformView = styled(Box)`
  position: absolute;
  top: 5%;
  left: -35%;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.5));

  @media (max-width: 768px) {
    top: 5%;
    left: -65% !important;
  }

  @media (max-width: 320px) {
    width: 507px;
    height: 317px;
    top: 5% !important;
    left: 10% !important;
  }
`

const LiveAreaDesktop = styled(Box)`
  position: relative;

  @media (max-width: 320px) {
    display: none;
  }
`

const LiveAreaMobile = styled(Box)`
  position: relative;
  margin-bottom: 40px;

  @media (min-width: 321px) {
    display: none;
  }
`

const GradientView = styled(Box)`
  position: absolute;
  width: 2080px !important;
  height: 1765px;
  top: -75%;
  left: -170%;
  filter: blur(600px);
  z-index: -1;
`