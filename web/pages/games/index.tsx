import styled from "@emotion/styled";
import LandingpageText from "components/landingpage/text";
import React from "react";
import { getPageTranslations } from "utils/i18n";
import { PageLayoutConfig } from "layouts/index";

export default function GamesPage() {
  return (
    <>
      <Hero />
    </>
  );
}

function Hero() {
  return (
    <HeroWrapper>
      <TextContainer>
        <LandingpageText variant="h1">
          Boost
          <br />
          {/* <ClientOnly>
            <Typist cursor={{ show: false }}>Booooost.</Typist>
          </ClientOnly> */}
          your
          <br />
          Game Creation
        </LandingpageText>
        <LandingpageText color="white" variant="body1">
          For passionate story tellers.
        </LandingpageText>
      </TextContainer>
      <BackgroundVideo
        src={
          "https://player.vimeo.com/progressive_redirect/playback/754142718/rendition/360p/file.mp4?loc=external&signature=e848d372f7f457bab03e05592647ab1379919c4698bfbd067ccc2b69261374e7"
        }
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
    </HeroWrapper>
  );
}

const TextContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: max-content;
  color: white !important;
  gap: 21px;
  margin: auto;
  z-index: 1;
`;

const BackgroundVideo = styled.video`
  z-index: -1;
  position: absolute;
  object-fit: cover;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const HeroWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  height: 760px;
  background-color: rgba(0, 0, 0, 0.2);
`;

GamesPage.layoutConfig = {
  mt: 0,
} as PageLayoutConfig;

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale)),
    },
  };
}
