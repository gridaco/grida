import styled from "@emotion/styled";
import React from "react";

export default function SectionCtaLastSeeTheMagic1024SizeMd() {
  return (
    <RootWrapperSectionCtaLastSeeTheMagic1024SizeMd>
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
        <FormArea>
          <Input>
            <Placeholder>
              https://www.figma.com/file/xxxx/xxxx?node-id=1234%3A5678
            </Placeholder>
          </Input>
          <Button>
            <Texts>
              <EmojiWond
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/4341/1554/128f94840d219df83cb481ca2ddd4a50"
                alt="image of EmojiWond"
              ></EmojiWond>
              <Label>Abracadabra</Label>
            </Texts>
          </Button>
        </FormArea>
      </ActionArea>
    </RootWrapperSectionCtaLastSeeTheMagic1024SizeMd>
  );
}

const RootWrapperSectionCtaLastSeeTheMagic1024SizeMd = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 62px;
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 105px 65px;
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
  align-items: center;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const ScribbleGuideContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 108px;
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
  width: 528px;
  height: 108px;
`;

const FormArea = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 24px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Input = styled.div`
  width: 619px;
  height: 83px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  position: relative;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
`;

const Placeholder = styled.span`
  color: rgba(210, 210, 210, 1);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  line-height: 160%;
  text-align: left;
  position: absolute;
  left: 28px;
  top: 25px;
`;

const Button = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 10px;
  box-shadow: 0px 4px 48px rgba(0, 0, 0, 0.12);
  border: solid 1px rgba(210, 210, 210, 1);
  border-radius: 4px;
  width: 251px;
  height: 83px;
  background-color: rgba(0, 0, 0, 1);
  box-sizing: border-box;
  padding: 12px 12px;
`;

const Texts = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 191px;
  height: 46px;
  box-sizing: border-box;
`;

const EmojiWond = styled.img`
  width: 46px;
  height: 46px;
  object-fit: cover;
`;

const Label = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: left;
`;
