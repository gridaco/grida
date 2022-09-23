import styled from "@emotion/styled";
import Image from "next/image";
import React from "react";

import LandingpageText from "components/landingpage/text";

import { breakpoints, BreakPoints } from "../_breakpoints";
import { CtaArea } from "../shared-cta-tocode";
import { useTranslation } from "next-i18next";
import ClientOnly from "components/clientonly";

export default function SectionCtaLastSeeTheMagicScaffold() {
  const { t, i18n } = useTranslation("page-index", {
    keyPrefix: "section/see-the-magic",
  });

  return (
    <Wrapper>
      <TextArea>
        <Heading variant="h2">{t("heading")}</Heading>
        <Desc variant="body1">{t("tagline")}</Desc>
      </TextArea>
      <ActionArea>
        <ScribbleGuideContainer>
          <ScribbleGuide>
            <ScribbleText
              fontFamily={
                i18n.language === "ja"
                  ? `"Hachi Maru Pop"`
                  : `"Nanum Pen Script", cursive`
              }
            >
              {t("cta-paste-link")}
            </ScribbleText>
            <Pointer />
          </ScribbleGuide>
          <Spacer></Spacer>
        </ScribbleGuideContainer>
        <CtaArea mode="footer-cta" />
      </ActionArea>
    </Wrapper>
  );
}

const Pointer = () => {
  const Src = () => {
    const xl2sm = (
      <Image
        width="60"
        height="60"
        src="/assets/magic-section-scribble/scribble-pointer-xl2sm.png"
        alt="image of PointerArtwork"
      />
    );
    const xs = (
      <Image
        width="60"
        height="60"
        src="/assets/magic-section-scribble/scribble-pointer-xs.png"
        alt="image of PointerArtwork"
      />
    );
    return (
      <ClientOnly>
        <BreakPoints.xl>{xl2sm}</BreakPoints.xl>
        <BreakPoints.lg>{xl2sm}</BreakPoints.lg>
        <BreakPoints.md>{xl2sm}</BreakPoints.md>
        <BreakPoints.sm>{xl2sm}</BreakPoints.sm>
        <BreakPoints.xs>{xs}</BreakPoints.xs>
      </ClientOnly>
    );
  };

  return (
    <PointerArtwork>
      <Src />
    </PointerArtwork>
  );
};

const Wrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 105px 191px;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    gap: 51px;
    background-color: rgba(255, 255, 255, 1);
    box-sizing: border-box;
    padding: 105px 128px;
  }
  @media ${breakpoints.md} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    gap: 62px;
    background-color: rgba(255, 255, 255, 1);
    box-sizing: border-box;
    padding: 105px 65px;
  }
  @media ${breakpoints.sm} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    gap: 65px;
    background-color: rgba(255, 255, 255, 1);
    box-sizing: border-box;
    padding: 105px 42px;
  }
  @media ${breakpoints.xs} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    gap: 74px;
    background-color: rgba(255, 255, 255, 1);
    box-sizing: border-box;
    padding: 105px 0px;
  }
`;

const TextArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 36px;
  align-self: stretch;
  box-sizing: border-box;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    flex: none;
    gap: 36px;
    align-self: stretch;
  }
  @media ${breakpoints.md} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 36px;
    align-self: stretch;
  }
  @media ${breakpoints.sm} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 36px;
    align-self: stretch;
  }
  @media ${breakpoints.xs} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 36px;
    align-self: stretch;
    box-sizing: border-box;
    padding: 0px 20px;
  }
`;

const Heading = styled(LandingpageText)`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  text-align: center;
  align-self: stretch;
`;

const Desc = styled(LandingpageText)`
  color: rgba(68, 69, 69, 1);
  line-height: 160%;
  text-align: center;
  align-self: stretch;
`;

const ActionArea = styled.div`
  @media ${breakpoints.xl} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    flex: none;
    gap: 6px;
    width: 1057px;
    height: 224px;
    box-sizing: border-box;
  }
  @media ${breakpoints.lg} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 3px;
    align-self: stretch;
    box-sizing: border-box;
  }
  @media ${breakpoints.md} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 0;
    align-self: stretch;
    box-sizing: border-box;
  }
  @media ${breakpoints.sm} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 0;
    align-self: stretch;
    box-sizing: border-box;
  }
  @media ${breakpoints.xs} {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 32px;
    padding: 20px;
    align-self: stretch;
    box-sizing: border-box;
  }
`;

const ScribbleGuideContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 172px;
  width: 1057px;
  height: 135px;
  box-sizing: border-box;
`;

const ScribbleGuide = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: end;
  flex: none;
  gap: 10px;
  width: 241px;
  height: 135px;
  box-sizing: border-box;
`;

const ScribbleText = styled.span<{ fontFamily: string }>`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  word-break: keep-all;
  font-size: 24px;
  font-family: ${props => props.fontFamily};
  font-weight: 400;
  line-height: 98%;
  text-align: left;
  transform: rotate(7deg);
`;

const PointerArtwork = styled.div`
  width: 75px;
  height: 84px;
  /* transform: rotate(23deg); */
`;

const Spacer = styled.div`
  @media ${breakpoints.xl} {
    width: 644px;
    height: 96px;
  }
  @media ${breakpoints.lg} {
    width: 652px;
    height: 109px;
  }
  @media ${breakpoints.md} {
    width: 528px;
    height: 108px;
  }
  @media ${breakpoints.sm} {
    width: 343px;
    height: 93px;
  }
  @media ${breakpoints.xs} {
    width: 100px;
    height: 100px;
  }
`;
