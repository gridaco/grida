import styled from "@emotion/styled";
import React from "react";

export default function Hero1440SizeXl() {
  return (
    <RootWrapperHero1440SizeXl>
      <HeroGradientBgArtwork
        src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/65cf/e84e/76efd4a87a6cdf0f109ad871ad15bff0"
        alt="image of HeroGradientBgArtwork"
      ></HeroGradientBgArtwork>
      <HeroTextAreaWithCta>
        <HeroTextAndBody>
          <Heading1>Figma to Code.</Heading1>
          <DescriptionHolder>
            <HeroBodyText>
              The Final, Open-sourced Design to code solution.
            </HeroBodyText>
          </DescriptionHolder>
        </HeroTextAndBody>
        <CtaArea>
          <HeroPrimaryInput>
            <HelpText>Enter your Figma design url</HelpText>
          </HeroPrimaryInput>
          <HeroPrimaryButton>
            <ToCode>To Code</ToCode>
          </HeroPrimaryButton>
        </CtaArea>
      </HeroTextAreaWithCta>
      <DesignToolExampleContainer></DesignToolExampleContainer>
      <IPhoneXFrame></IPhoneXFrame>
    </RootWrapperHero1440SizeXl>
  );
}

const RootWrapperHero1440SizeXl = styled.div`
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
`;

const HeroGradientBgArtwork = styled.img`
  width: 785px;
  height: 739px;
  object-fit: cover;
  position: absolute;
  left: calc((calc((50% + 328px)) - 393px));
  top: 185px;
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
  left: calc((calc((50% + -195px)) - 325px));
  top: 342px;
  width: 650px;
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

const Heading1 = styled.span`
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

const CtaArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 14px;
  width: 498px;
  height: 66px;
  box-sizing: border-box;
`;

const HeroPrimaryInput = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  border-left: solid 1px rgba(210, 210, 210, 1);
  border-top: solid 1px rgba(210, 210, 210, 1);
  border-bottom: solid 1px rgba(210, 210, 210, 1);
  border-right: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  width: 322px;
  height: 66px;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 24px 24px;
`;

const HelpText = styled.span`
  color: rgba(181, 181, 181, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: left;
`;

const HeroPrimaryButton = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 10px;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  border-left: solid 1px rgba(37, 98, 255, 0.5);
  border-top: solid 1px rgba(37, 98, 255, 0.5);
  border-bottom: solid 1px rgba(37, 98, 255, 0.5);
  border-right: solid 1px rgba(37, 98, 255, 0.5);
  border-radius: 4px;
  align-self: stretch;
  background-color: rgba(37, 98, 255, 1);
  box-sizing: border-box;
  padding: 12px 48px;
`;

const ToCode = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: center;
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
