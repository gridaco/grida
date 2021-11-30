import styled from "@emotion/styled";
import React from "react";

import { MagicCtaForm } from "./components";

export default function SectionCtaLastSeeTheMagic1280SizeLg() {
  return (
    <RootWrapperSectionCtaLastSeeTheMagic1280SizeLg>
      <TextArea>
        <Heading>See the magic</Heading>
        <Desc>See what you truley do with your power supercharged.</Desc>
      </TextArea>
      <ActionArea>
        <ScribbleGuideContainer>
          <ScribbleGuide>
            <ScribbleText>Paste your figma design url.</ScribbleText>
            <PointerArtwork
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/7b17/c650/db733369042b3472677812747401cb55"
              alt="image of PointerArtwork"
            ></PointerArtwork>
          </ScribbleGuide>
          <Spacer></Spacer>
        </ScribbleGuideContainer>
        <MagicCtaForm></MagicCtaForm>
      </ActionArea>
    </RootWrapperSectionCtaLastSeeTheMagic1280SizeLg>
  );
}

const RootWrapperSectionCtaLastSeeTheMagic1280SizeLg = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 51px;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 105px 128px;
`;

const TextArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 36px;
  width: 655px;
  height: 137px;
  box-sizing: border-box;
`;

const Heading = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  line-height: 98%;
  text-align: center;
  align-self: stretch;
`;

const Desc = styled.span`
  color: rgba(68, 69, 69, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  line-height: 160%;
  text-align: center;
  align-self: stretch;
`;

const ActionArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 3px;
  align-self: stretch;
  box-sizing: border-box;
`;

const ScribbleGuideContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 127px;
  align-self: stretch;
  box-sizing: border-box;
`;

const ScribbleGuide = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: end;
  flex: none;
  gap: 0;
  width: 241px;
  height: 135px;
  box-sizing: border-box;
`;

const ScribbleText = styled.span`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Nanum Pen Script", sans-serif;
  font-weight: 400;
  line-height: 98%;
  text-align: left;
  transform: rotate(7deg);
`;

const PointerArtwork = styled.img`
  width: 75px;
  height: 84px;
  object-fit: cover;
  transform: rotate(23deg);
`;

const Spacer = styled.div`
  width: 652px;
  height: 109px;
`;
