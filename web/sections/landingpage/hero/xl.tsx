import styled from "@emotion/styled";
import React from "react";

import { k } from "sections";

import MusicHome from "../demo-app";
import { CtaArea } from "./components/cta-area";

export default function Hero1440SizeXl() {
  return (
    <RootWrapperHero1440SizeXl key="section-hero">
      <HeroGradientBgArtwork
        src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/65cf/e84e/76efd4a87a6cdf0f109ad871ad15bff0"
        alt="image of HeroGradientBgArtwork"
      ></HeroGradientBgArtwork>
      <HeroTextAreaWithCta>
        <HeroTextAndBody>
          <Heading1>{k.contents.heading1_figma_to_code}</Heading1>
          <DescriptionHolder>
            <HeroBodyText>{k.contents.p_hero_description}</HeroBodyText>
          </DescriptionHolder>
        </HeroTextAndBody>
        <CtaArea></CtaArea>
      </HeroTextAreaWithCta>
      <DesignToolExampleContainer></DesignToolExampleContainer>
      <IPhoneXFrame>
        <MusicHome scale={0.753} />
      </IPhoneXFrame>
    </RootWrapperHero1440SizeXl>
  );
}

const RootWrapperHero1440SizeXl = styled.div`
  height: 1033px;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
  overflow: hidden;
`;

const HeroGradientBgArtwork = styled.img`
  width: 785px;
  height: 739px;
  object-fit: cover;
  position: absolute;
  left: calc((calc((50% + 328px)) - 393px));
  top: 185px;
  transform: scale(3);
  /* filter: blur(426.44px); */
`;

const HeroTextAreaWithCta = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 62px;
  box-sizing: border-box;
  position: absolute;
  left: calc((calc((50% + -195px)) - 325px));
  top: 342px;
  height: 322px;
`;

const HeroTextAndBody = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 40px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Heading1 = styled.h1`
  color: rgba(0, 0, 0, 0.9);
  text-overflow: ellipsis;
  font-size: 80px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -2px;
  line-height: 98%;
  text-align: left;
  align-self: stretch;
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
  left: calc((calc((50% + 706px)) - 454px));
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
  left: calc((calc((50% + 353px)) - 141px));
  top: 240px;
  opacity: 0.9;
`;
