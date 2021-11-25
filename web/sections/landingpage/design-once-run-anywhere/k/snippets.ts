export const _DEMO_APP_SRC_TSX = `import styled from "@emotion/styled";
import React from "react";

export default function DemoApp({ scale = 1 }: { scale?: number }) {
  return (
    <RootWrapperDemoApp scale={scale}>
      <FriendsMusicSection>
        <FriendListeningHeaderText>
          Lauren is listening
        </FriendListeningHeaderText>
        <MusicSecondaryList>
          <Primary>
            <Cover>
              <Rectangle825
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/0cf0/7836/f073708c3ceb92d2504f0a572048367b"
                alt="image of Rectangle825"
              ></Rectangle825>
              <TrpLve>
                TRP
                <br />
                LVE
              </TrpLve>
            </Cover>
            <NonGraphicsArea>
              <InnerFrame>
                <TextInfo>
                  <Trippe>TRIPPE</Trippe>
                  <MorningSlowbeatsLoFi>
                    Morning Slowbeats - LoFi
                  </MorningSlowbeatsLoFi>
                </TextInfo>
                <MusicPlayButton
                  src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/56fc/4c35/733e07dee25b0dce8c66a2fb86ef998f"
                  alt="icon"
                ></MusicPlayButton>
              </InnerFrame>
            </NonGraphicsArea>
          </Primary>
          <Card1>
            <Contents>
              <Cover_0001>
                <Rectangle825_0001
                  src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/26c1/ce4d/c339eeaa7bbbdad0c83e2ab036fbfecb"
                  alt="image of Rectangle825"
                ></Rectangle825_0001>
                <Union
                  src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/6cd5/7710/811330309e1aeaea91da25f5cac2adfd"
                  alt="image of Union"
                ></Union>
              </Cover_0001>
              <NonGraphicArea>
                <TextInfo_0001>
                  <Sweet>Sweet</Sweet>
                  <MorningSlowbeatsLoFi_0001>
                    Morning Slowbeats - LoFi
                  </MorningSlowbeatsLoFi_0001>
                </TextInfo_0001>
                <MusicPlayButton_0001
                  src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e80e/fc39/da9065547bba86fc0f83f31a4310271c"
                  alt="icon"
                ></MusicPlayButton_0001>
              </NonGraphicArea>
            </Contents>
          </Card1>
          <Card2>
            <Contents_0001>
              <DemoAppAlbumCover1>
                <Rectangle813></Rectangle813>
                <LoFi>
                  LO
                  <br />
                  FI
                </LoFi>
              </DemoAppAlbumCover1>
              <NonGraphicArea_0001>
                <TextInfo_0002>
                  <Sweet_0001>Falling</Sweet_0001>
                  <MorningSlowbeatsLoFi_0002>
                    Morning Slowbeats - LoFi
                  </MorningSlowbeatsLoFi_0002>
                </TextInfo_0002>
                <MusicPlayButton_0002
                  src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e80e/fc39/da9065547bba86fc0f83f31a4310271c"
                  alt="icon"
                ></MusicPlayButton_0002>
              </NonGraphicArea_0001>
            </Contents_0001>
          </Card2>
        </MusicSecondaryList>
      </FriendsMusicSection>
      <HeaderSection>
        <TitleAndAvatar>
          <Title>Saturday Morning Mix</Title>
          <AvatarSource
            src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/4f6b/36d5/17d6b783005c459c272ce5fb879a9e9f"
            alt="image of AvatarSource"
          ></AvatarSource>
        </TitleAndAvatar>
        <Subtitle>
          Here are some tunes for you to start your morning. Mostly quiet and
          slow-beat, some of them are mood changer.
        </Subtitle>
      </HeaderSection>
      <Group523>
        <Rectangle819></Rectangle819>
        <Group519
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/9562/c646/ed1c906b14016ebf915140b81c0638ce"
          alt="icon"
        ></Group519>
        <MorningSlowbeatsLoFi_0003>
          Morning Slowbeats - LoFi
        </MorningSlowbeatsLoFi_0003>
        <Trippe_0001>TRIPPE</Trippe_0001>
        <Rectangle825_0002></Rectangle825_0002>
      </Group523>
      <DemoAppTabBar>
        <Rectangle815></Rectangle815>
        <Tabs>
          <IconsMdiHome
            src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e350/9fb4/422697fd40f9d0f19a35ebbc5df11b57"
            alt="image of IconsMdiHome"
          ></IconsMdiHome>
          <IconsMdiShowChart
            src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/1436/9fa1/ba7653876dc7ca8fe523b354816f5319"
            alt="image of IconsMdiShowChart"
          ></IconsMdiShowChart>
          <IconsMdiSearch
            src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5fda/b17b/6bdba2e87f84c133ad91b1f5c7da0785"
            alt="image of IconsMdiSearch"
          ></IconsMdiSearch>
        </Tabs>
      </DemoAppTabBar>
      <PrimaryMusicCardsList>
        <Card1_0001>
          <Frame305>
            <DemoAppAlbumCover1_0001>
              <Rectangle813_0001></Rectangle813_0001>
              <LoFi_0001>
                LO
                <br />
                FI
              </LoFi_0001>
            </DemoAppAlbumCover1_0001>
            <MusicPlayButton_0003
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5f4a/558c/5524bce036659c4f82d652b44961d944"
              alt="icon"
            ></MusicPlayButton_0003>
          </Frame305>
          <MorningSlowbeatsLoFi_0004>
            Morning Slowbeats - LoFi
          </MorningSlowbeatsLoFi_0004>
        </Card1_0001>
        <Card2_0001>
          <Frame305_0001>
            <DemoAppAlbumCover3>
              <Rectangle825_0003
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/8a94/bb41/b26e2d09badc33fd87413d2d7cb4f2d6"
                alt="image of Rectangle825"
              ></Rectangle825_0003>
              <Union_0001
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/c86a/b0ec/2cbaa0a2ffcf6665e30c288e0a09bbc4"
                alt="image of Union"
              ></Union_0001>
            </DemoAppAlbumCover3>
            <MusicPlayButton_0004
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5f4a/558c/5524bce036659c4f82d652b44961d944"
              alt="icon"
            ></MusicPlayButton_0004>
          </Frame305_0001>
          <MorningSlowbeatsLoFi_0005>
            Morning Slowbeats - LoFi
          </MorningSlowbeatsLoFi_0005>
        </Card2_0001>
        <Card3>
          <Frame305_0002>
            <DemoAppAlbumCover2>
              <Rectangle825_0004
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/b802/fe12/70b07a6592a33589a9350bb8a5295d9d"
                alt="image of Rectangle825"
              ></Rectangle825_0004>
              <TrpLve_0001>
                TRP
                <br />
                LVE
              </TrpLve_0001>
            </DemoAppAlbumCover2>
            <MusicPlayButton_0005
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5f4a/558c/5524bce036659c4f82d652b44961d944"
              alt="icon"
            ></MusicPlayButton_0005>
          </Frame305_0002>
          <MorningSlowbeatsLoFi_0006>
            Morning Slowbeats - LoFi
          </MorningSlowbeatsLoFi_0006>
        </Card3>
      </PrimaryMusicCardsList>
    </RootWrapperDemoApp>
  );
}

const RootWrapperDemoApp = styled.div<{
  scale: number;
}>\`
  width: 375px;
  height: 812px;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
  transform: scale(${p => p.scale});
  transform-origin: left top;
  overflow: hidden;
\`;

const FriendsMusicSection = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 24px;
  box-sizing: border-box;
  position: absolute;
  left: 28px;
  top: 459px;
  right: 28px;
  height: 311px;
\`;

const FriendListeningHeaderText = styled.span\`
  color: rgba(58, 58, 58, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
  width: 232px;
\`;

const MusicSecondaryList = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 12px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const Primary = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 4px;
  box-shadow: 0px 4px 24px 4px rgba(111, 111, 111, 0.08);
  border-radius: 4px;
  align-self: stretch;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
\`;

const Cover = styled.div\`
  width: 81px;
  position: relative;
  align-self: stretch;
\`;

const Rectangle825 = styled.img\`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const TrpLve = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: center;
  position: absolute;
  left: 22px;
  top: 24px;
  right: 21px;
  bottom: 24px;
\`;

const NonGraphicsArea = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 10px 10px;
\`;

const InnerFrame = styled.div\`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 20px;
  align-self: stretch;
  box-sizing: border-box;
  padding-right: 12px;
\`;

const TextInfo = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 5px;
  width: 158px;
  height: 59px;
  box-sizing: border-box;
\`;

const Trippe = styled.span\`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
  align-self: stretch;
\`;

const MorningSlowbeatsLoFi = styled.span\`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const MusicPlayButton = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const Card1 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  border-radius: 4px;
  align-self: stretch;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 8px 8px;
\`;

const Contents = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 20px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const Cover_0001 = styled.div\`
  width: 65px;
  height: 65px;
  position: relative;
\`;

const Rectangle825_0001 = styled.img\`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const Union = styled.img\`
  object-fit: cover;
  position: absolute;
  left: 9px;
  top: 9px;
  right: 10px;
  bottom: 9px;
\`;

const NonGraphicArea = styled.div\`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 22px;
  align-self: stretch;
  box-sizing: border-box;
  padding-right: 8px;
\`;

const TextInfo_0001 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 5px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const Sweet = styled.span\`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
\`;

const MorningSlowbeatsLoFi_0001 = styled.span\`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const MusicPlayButton_0001 = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const Card2 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  border-radius: 4px;
  align-self: stretch;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
  padding: 8px 8px;
\`;

const Contents_0001 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 20px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const DemoAppAlbumCover1 = styled.div\`
  width: 65px;
  height: 65px;
  position: relative;
\`;

const Rectangle813 = styled.div\`
  background-color: rgba(0, 0, 0, 1);
  border-radius: 8px;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const LoFi = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Helvetica, sans-serif;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 90%;
  text-align: left;
  position: absolute;
  left: 4px;
  top: 33px;
  right: 11px;
  bottom: -32px;
\`;

const NonGraphicArea_0001 = styled.div\`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 22px;
  align-self: stretch;
  box-sizing: border-box;
  padding-right: 8px;
\`;

const TextInfo_0002 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 5px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const Sweet_0001 = styled.span\`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
\`;

const MorningSlowbeatsLoFi_0002 = styled.span\`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const MusicPlayButton_0002 = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const HeaderSection = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 16px;
  box-sizing: border-box;
  position: absolute;
  left: 28px;
  top: 64px;
  right: 28px;
  height: 128px;
\`;

const TitleAndAvatar = styled.div\`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 16px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const Title = styled.span\`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Sen, sans-serif;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 90%;
  text-align: left;
  width: 251px;
\`;

const AvatarSource = styled.img\`
  width: 48px;
  height: 48px;
  object-fit: cover;
\`;

const Subtitle = styled.span\`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  width: 315px;
\`;

const Group523 = styled.div\`
  width: 315px;
  height: 81px;
  position: absolute;
  left: 28px;
  top: 778px;
\`;

const Rectangle819 = styled.div\`
  width: 315px;
  height: 81px;
  background-color: rgba(255, 255, 255, 1);
  border-radius: 4px;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const Group519 = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
  position: absolute;
  left: 263px;
  top: 29px;
\`;

const MorningSlowbeatsLoFi_0003 = styled.span\`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  width: 150px;
  position: absolute;
  left: 82px;
  top: 32px;
\`;

const Trippe_0001 = styled.span\`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
  position: absolute;
  left: 82px;
  top: 11px;
\`;

const Rectangle825_0002 = styled.div\`
  width: 60px;
  height: 60px;
  background-color: rgba(0, 0, 0, 1);
  border-radius: 4px;
  position: absolute;
  left: 10px;
  top: 11px;
\`;

const DemoAppTabBar = styled.div\`
  height: 97px;
  position: absolute;
  left: 0px;
  right: 0px;
  bottom: -2px;
\`;

const Rectangle815 = styled.div\`
  box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.25);
  background-color: rgba(255, 255, 255, 1);
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const Tabs = styled.div\`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: start;
  gap: 68px;
  box-sizing: border-box;
  position: absolute;
  left: 46px;
  top: 29px;
  right: 46px;
  bottom: 44px;
\`;

const IconsMdiHome = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const IconsMdiShowChart = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const IconsMdiSearch = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const PrimaryMusicCardsList = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 16px;
  box-sizing: border-box;
  position: absolute;
  left: 28px;
  top: 234px;
  width: 447px;
  height: 180px;
\`;

const Card1_0001 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 4px;
  width: 138px;
  height: 180px;
  box-sizing: border-box;
\`;

const Frame305 = styled.div\`
  height: 144px;
  position: relative;
  align-self: stretch;
\`;

const DemoAppAlbumCover1_0001 = styled.div\`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const Rectangle813_0001 = styled.div\`
  background-color: rgba(0, 0, 0, 1);
  border-radius: 8px;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const LoFi_0001 = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Helvetica, sans-serif;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 90%;
  text-align: left;
  position: absolute;
  left: 8px;
  top: 72px;
  right: 81px;
  bottom: 8px;
\`;

const MusicPlayButton_0003 = styled.img\`
  width: 28px;
  height: 28px;
  object-fit: cover;
  position: absolute;
  right: 16px;
  bottom: 14px;
\`;

const MorningSlowbeatsLoFi_0004 = styled.span\`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const Card2_0001 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 4px;
  width: 138px;
  height: 180px;
  box-sizing: border-box;
\`;

const Frame305_0001 = styled.div\`
  height: 144px;
  position: relative;
  align-self: stretch;
\`;

const DemoAppAlbumCover3 = styled.div\`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const Rectangle825_0003 = styled.img\`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const Union_0001 = styled.img\`
  object-fit: cover;
  position: absolute;
  left: 17px;
  top: 19px;
  right: 19px;
  bottom: 22px;
\`;

const MusicPlayButton_0004 = styled.img\`
  width: 28px;
  height: 28px;
  object-fit: cover;
  position: absolute;
  right: 16px;
  bottom: 14px;
\`;

const MorningSlowbeatsLoFi_0005 = styled.span\`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const Card3 = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 4px;
  width: 138px;
  height: 180px;
  box-sizing: border-box;
\`;

const Frame305_0002 = styled.div\`
  height: 144px;
  position: relative;
  align-self: stretch;
\`;

const DemoAppAlbumCover2 = styled.div\`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const Rectangle825_0004 = styled.img\`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
\`;

const TrpLve_0001 = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 32px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: center;
  position: absolute;
  left: 38px;
  top: 43px;
  right: 36px;
  bottom: 43px;
\`;

const MusicPlayButton_0005 = styled.img\`
  width: 28px;
  height: 28px;
  object-fit: cover;
  position: absolute;
  right: 16px;
  bottom: 14px;
\`;

const MorningSlowbeatsLoFi_0006 = styled.span\`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;
`;
