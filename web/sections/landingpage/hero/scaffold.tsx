import styled from "@emotion/styled";
import React from "react";

import { k } from "sections";

import { breakpoints } from "../_breakpoints";
import DemoApp from "../demo-app";
import { CtaArea } from "./components/cta-area";

export default function HeroResponsive() {
  return (
    <Wrapper key="section-hero">
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
        <DemoApp scale={0.753} />
      </IPhoneXFrame>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  background-color: rgba(255, 255, 255, 1);
  position: relative;
  overflow: hidden;

  @media ${breakpoints.xl} {
    height: 1033px;
  }
  @media ${breakpoints.lg} {
    height: 1033px;
  }
  @media ${breakpoints.md} {
    height: 1033px;
  }
  @media ${breakpoints.sm} {
    height: 984px;
  }
  @media ${breakpoints.xs} {
    height: 657px;
  }
`;

const HeroGradientBgArtwork = styled.img`
  width: 785px;
  height: 739px;
  object-fit: cover;
  position: absolute;
  left: calc((calc((50% + 328px)) - 393px));
  top: 185px;
  /* transform: scale(3); */
  /* filter: blur(426.44px); */

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
  }
  @media ${breakpoints.md} {
  }
  @media ${breakpoints.sm} {
    right: -739px;
    bottom: 161px;
  }
  @media ${breakpoints.xs} {
    right: -224px;
    bottom: 470px;
  }
`;

const HeroTextAreaWithCta = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  box-sizing: border-box;
  position: absolute;

  @media ${breakpoints.xl} {
    gap: 62px;
    left: calc((calc((50% + -195px)) - 325px));
    top: 342px;
    height: 322px;
  }
  @media ${breakpoints.lg} {
    gap: 62px;
    left: calc((calc((50% + -244px)) - 276px));
    top: 342px;
    height: 322px;
  }
  @media ${breakpoints.md} {
    gap: 62px;
    left: calc((calc((50% + -212px)) - 276px));
    top: 342px;
    width: 552px;
  }
  @media ${breakpoints.sm} {
    gap: 62px;
    left: calc((calc((50% + -145px)) - 216px));
    top: 342px;
    width: 431px;
    height: 362px;
  }
  @media ${breakpoints.xs} {
    gap: 64px;
    left: 20px;
    top: 140px;
    right: 20px;
    height: 404px;
  }
`;

const HeroTextAndBody = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  align-self: stretch;
  box-sizing: border-box;

  @media ${breakpoints.xl} {
    flex: 1;
    gap: 24px;
  }
  @media ${breakpoints.lg} {
    gap: 24px;
  }
  @media ${breakpoints.md} {
    gap: 24px;
    width: 552px;
  }
  @media ${breakpoints.sm} {
    gap: 40px;
    width: 319px;
  }
  @media ${breakpoints.xs} {
    flex: 1;
    gap: 40px;
  }
`;

const Heading1 = styled.h1`
  color: rgba(0, 0, 0, 0.9);
  margin-block: 0px;
  text-overflow: ellipsis;
  font-size: 80px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -2px;
  line-height: 98%;
  text-align: left;

  @media ${breakpoints.xl} {
    align-self: stretch;
  }
  @media ${breakpoints.lg} {
    font-size: 80px;
    font-weight: 700;
    letter-spacing: -2px;
    line-height: 98%;
  }
  @media ${breakpoints.md} {
    font-size: 80px;
    font-weight: 700;
    letter-spacing: -2px;
    line-height: 98%;
  }
  @media ${breakpoints.sm} {
    font-size: 64px;
    font-weight: 700;
    letter-spacing: -2px;
    line-height: 98%;
    width: 319px;
  }
  @media ${breakpoints.xs} {
    font-size: 48px;
    font-weight: 700;
    letter-spacing: -1px;
    line-height: 98%;
    align-self: stretch;
  }
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

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    justify-content: center;
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 24px;
    width: 319px;
    height: 76px;
  }
  @media ${breakpoints.md} {
    justify-content: center;
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 24px;
    width: 319px;
    height: 76px;
  }
  @media ${breakpoints.sm} {
    justify-content: center;
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 24px;
    width: 319px;
    height: 76px;
  }
  @media ${breakpoints.xs} {
    justify-content: center;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 24px;
    align-self: stretch;
  }
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

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    font-size: 24px;
    font-weight: 500;
    line-height: 160%;
    text-align: left;
    width: 319px;
  }
  @media ${breakpoints.md} {
    font-size: 24px;
    font-weight: 500;
    line-height: 160%;
    text-align: left;
    width: 319px;
  }
  @media ${breakpoints.sm} {
    font-size: 24px;
    font-weight: 500;
    line-height: 160%;
    text-align: left;
    width: 319px;
  }
  @media ${breakpoints.xs} {
    font-size: 24px;
    font-weight: 500;
    line-height: 160%;
    text-align: left;
    align-self: stretch;
  }
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

  @media ${breakpoints.xs} {
    display: none;
  }
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

  @media ${breakpoints.xs} {
    display: none;
  }
`;
