import styled from "@emotion/styled";
import React from "react";

import DemoApp from "../demo-app";
import { CtaArea } from "./components/cta-area";

export default function Hero768SizeSm() {
  return (
    <RootWrapperHero768SizeSm key="section-hero">
      <_1440SizeXl>
        <HeroGradientBgArtwork
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/65cf/e84e/76efd4a87a6cdf0f109ad871ad15bff0"
          alt="image of HeroGradientBgArtwork"
        ></HeroGradientBgArtwork>
        <HeroTextAreaWithCta>
          <HeroTextAndBody>
            <HeroTextAreaWithCta_0001>
              <Heading1>Figma to Code.</Heading1>
              <DescriptionHolder>
                <HeroBodyText>
                  The Final, Open-sourced Design to code solution.
                </HeroBodyText>
              </DescriptionHolder>
            </HeroTextAreaWithCta_0001>
          </HeroTextAndBody>
          <CtaArea></CtaArea>
        </HeroTextAreaWithCta>
        <DesignToolExampleContainer></DesignToolExampleContainer>
        <IPhoneXFrame>
          <DemoApp scale={0.753} />
        </IPhoneXFrame>
      </_1440SizeXl>
    </RootWrapperHero768SizeSm>
  );
}

const RootWrapperHero768SizeSm = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 0;
  height: 984px;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
`;

const _1440SizeXl = styled.div`
  height: 984px;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
  align-self: stretch;
`;

const HeroGradientBgArtwork = styled.img`
  width: 1023px;
  height: 739px;
  object-fit: cover;
  position: absolute;
  right: -739px;
  bottom: 161px;
  filter: blur(426.44px);
`;

const HeroTextAreaWithCta = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 62px;
  box-sizing: border-box;
  position: absolute;
  left: calc((calc((50% + -145px)) - 216px));
  top: 342px;
  width: 431px;
  height: 362px;
`;

const HeroTextAndBody = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 147px;
  width: 319px;
  height: 242px;
  box-sizing: border-box;
`;

const HeroTextAreaWithCta_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 40px;
  width: 319px;
  height: 242px;
  box-sizing: border-box;
`;

const Heading1 = styled.span`
  color: rgba(0, 0, 0, 0.9);
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -2px;
  line-height: 98%;
  text-align: left;
  width: 319px;
`;

const DescriptionHolder = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 24px;
  width: 319px;
  height: 76px;
  box-sizing: border-box;
`;

const HeroBodyText = styled.span`
  color: rgba(68, 69, 69, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  line-height: 160%;
  text-align: left;
  width: 319px;
`;

const DesignToolExampleContainer = styled.div`
  width: 907px;
  height: 571px;
  overflow: hidden;
  border-radius: 4px;
  position: absolute;
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.2);
  left: calc((calc((50% + 646px)) - 454px));
  top: 173px;
  opacity: 0.7;
`;

const IPhoneXFrame = styled.div`
  width: 282px;
  height: 611px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border-radius: 4px;
  position: absolute;
  box-shadow: 0px 3px 103px 26px rgba(0, 0, 0, 0.2);
  left: calc((calc((50% + 293px)) - 141px));
  top: 240px;
  opacity: 0.9;
`;
