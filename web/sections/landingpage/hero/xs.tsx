import styled from "@emotion/styled";
import React from "react";

import { CtaArea } from "./components/cta-area";

export default function Hero320SizeXs() {
  return (
    <RootWrapperHero320SizeXs key="section-hero">
      <_1440SizeXl>
        <HeroGradientBgArtwork
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/209d/e4a2/57f702bfc430d87427a5225fa94a6d54"
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
      </_1440SizeXl>
    </RootWrapperHero320SizeXs>
  );
}

const RootWrapperHero320SizeXs = styled.div`
  min-height: 603px;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
`;

const _1440SizeXl = styled.div`
  height: 657px;
  background-color: rgba(255, 255, 255, 1);
  left: 0px;
  top: 0px;
  right: 0px;
`;

const HeroGradientBgArtwork = styled.img`
  width: 236px;
  height: 136px;
  object-fit: cover;
  position: absolute;
  right: -224px;
  bottom: 470px;
  /* filter: blur(252.78px); */
`;

const HeroTextAreaWithCta = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 64px;
  box-sizing: border-box;
  position: absolute;
  left: 20px;
  top: 140px;
  right: 20px;
  height: 404px;
`;

const HeroTextAndBody = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 147px;
  width: 280px;
  height: 210px;
  box-sizing: border-box;
`;

const HeroTextAreaWithCta_0001 = styled.div`
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
  font-size: 48px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: left;
  align-self: stretch;
`;

const DescriptionHolder = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 24px;
  align-self: stretch;
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
  align-self: stretch;
`;

const HeroPrimaryInput = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 10px;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  border-left: solid 1px rgba(210, 210, 210, 1);
  border-top: solid 1px rgba(210, 210, 210, 1);
  border-bottom: solid 1px rgba(210, 210, 210, 1);
  border-right: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  align-self: stretch;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 20px 20px;
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
  padding: 12px 12px;
`;

const ToCode = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: left;
`;
