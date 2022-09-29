import styled from "@emotion/styled";
import Image from "next/image";
import React from "react";
import { breakpoints } from "../_breakpoints";
import MusicHome from "../demo-app";
import { CtaArea } from "../shared-cta-tocode";
import { useTranslation } from "next-i18next";
import { Background } from "./components/background";

export default function HeroResponsive() {
  const { t } = useTranslation("page-index", {
    keyPrefix: "section/hero",
  });

  return (
    <Wrapper key="section-hero">
      <Background />
      <HeroTextAreaWithCta>
        <HeroTextAndBody>
          <Heading1>{t("heading")}</Heading1>
          <DescriptionHolder>
            <HeroBodyText>{t("p")}</HeroBodyText>
          </DescriptionHolder>
        </HeroTextAndBody>
        <CtaArea mode="hero-cta" />
      </HeroTextAreaWithCta>
      <DesignToolExampleContainer>
        <Image
          src="/assets/design-platforms/figma.png"
          width={907}
          height={571}
          layout="fill"
        />
      </DesignToolExampleContainer>
      <IPhoneXFrame>
        <MusicHome scale={0.753} />
      </IPhoneXFrame>
    </Wrapper>
  );
}

const Wrapper = styled.div`
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
    height: 860px;
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
    top: 300px;
  }
  @media ${breakpoints.lg} {
    gap: 62px;
    left: calc((calc((50% + -244px)) - 276px));
    top: 300px;
  }
  @media ${breakpoints.md} {
    gap: 62px;
    left: calc((calc((50% + -212px)) - 276px));
    top: 280px;
    width: 552px;
  }
  @media ${breakpoints.sm} {
    gap: 62px;
    left: calc((calc((50% + -145px)) - 216px));
    top: 240px;
    width: 431px;
  }
  @media ${breakpoints.xs} {
    gap: 64px;
    left: 20px;
    top: 140px;
    right: 20px;
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
  box-sizing: border-box;
  @media ${breakpoints.xl} {
    width: 520px;
  }
  @media ${breakpoints.lg} {
    justify-content: center;
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 24px;
    width: 520px;
  }
  @media ${breakpoints.md} {
    justify-content: center;
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 24px;
    width: 520px;
  }
  @media ${breakpoints.sm} {
    justify-content: center;
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 24px;
    width: 400px;
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
  color: #727272;
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  line-height: 160%;
  text-align: left;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    line-height: 160%;
    text-align: left;
    /* width: 319px; */
  }
  @media ${breakpoints.md} {
    line-height: 160%;
    text-align: left;
    /* width: 319px; */
  }
  @media ${breakpoints.sm} {
    line-height: 160%;
    text-align: left;
    /* width: 319px; */
  }
  @media ${breakpoints.xs} {
    line-height: 160%;
    text-align: left;
    align-self: stretch;
  }
`;

const DesignToolExampleContainer = styled.div`
  /* region disable dragging */
  user-select: none;
  -webkit-user-drag: none;
  /* endregion disable dragging */

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
