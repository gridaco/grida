import styled from "@emotion/styled";
import React from "react";

import { MagicCtaForm } from "./components";

export default function SectionCtaLastSeeTheMagic320SizeXs() {
  return (
    <RootWrapperSectionCtaLastSeeTheMagic320SizeXs>
      <TextArea>
        <Heading>See the magic</Heading>
        <Desc>See what you truley do with your power supercharged.</Desc>
      </TextArea>
      <ActionArea>
        <ScribbleGuideContainer>
          <ScribbleGuide>
            <ScribbleText>Paste your figma design url.</ScribbleText>
            <PointerArtwork
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/dbe2/a028/8f7b6ec0685e3ddcb2dba271ada4a56d"
              alt="image of PointerArtwork"
            ></PointerArtwork>
          </ScribbleGuide>
          <Spacer></Spacer>
        </ScribbleGuideContainer>
        <MagicCtaForm />
      </ActionArea>
    </RootWrapperSectionCtaLastSeeTheMagic320SizeXs>
  );
}

const RootWrapperSectionCtaLastSeeTheMagic320SizeXs = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 74px;
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 105px 0px;
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
  padding: 0px 20px;
`;

const Heading = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 32px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: center;
  align-self: stretch;
`;

const Desc = styled.span`
  color: rgba(68, 69, 69, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: center;
  align-self: stretch;
`;

const ActionArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 32px;
  padding: 20px;
  align-self: stretch;
  box-sizing: border-box;
`;

const ScribbleGuideContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: end;
  flex: 1;
  gap: 0;
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
  width: 181px;
  height: 109px;
  box-sizing: border-box;
`;

const ScribbleText = styled.span`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Nanum Pen Script", sans-serif;
  font-weight: 400;
  line-height: 98%;
  text-align: left;
  transform: rotate(7deg);
`;

const PointerArtwork = styled.img`
  width: 55px;
  height: 71px;
  object-fit: cover;
  transform: rotate(357deg);
`;

const Spacer = styled.div`
  width: 100px;
  height: 100px;
`;
