export const _DEMO_APP_SRC_TSX = `
import styled from "@emotion/styled";
import React from "react";

export default function MusicHome() {
  return (
    <Wrapper>
      <Body>
        <TopSpacer />
        <HeaderPart />
        <PrimaryMusicCardsListPart />
        <FriendsMusicSectionPart />
        <TabBar />
      </Body>
    </Wrapper>
  );
}

const HeaderPart = () => {
  return (
    <SectionHeader>
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
    </SectionHeader>
  );
};

const CardMusicItem = ({
  artwork,
  musicName,
}: {
  artwork: string | JSX.Element;
  musicName: string;
}) => {
  return (
    <CardWrapper>
      <ArtworkContainer>
        {artwork}
        <MusicPlayButton
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5f4a/558c/5524bce036659c4f82d652b44961d944"
          alt="icon"
        ></MusicPlayButton>
      </ArtworkContainer>
      <MusicName>{musicName}</MusicName>
    </CardWrapper>
  );
};

const PrimaryMusicCardsListPart = () => {
  return (
    <PrimaryMusicCardsList>
      <CardMusicItem
        musicName={"Morning Slowbeats - LoFi"}
        artwork={
          <DemoAppAlbumCover1>
            <Rectangle813></Rectangle813>
            <LoFi>
              LO
              <br />
              FI
            </LoFi>
          </DemoAppAlbumCover1>
        }
      />
      <CardMusicItem
        musicName={"Sweet nothings"}
        artwork={
          <DemoAppAlbumCover3>
            <Rectangle825
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/8a94/bb41/b26e2d09badc33fd87413d2d7cb4f2d6"
              alt="image of Rectangle825"
            ></Rectangle825>
            <Union
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/c86a/b0ec/2cbaa0a2ffcf6665e30c288e0a09bbc4"
              alt="image of Union"
            ></Union>
          </DemoAppAlbumCover3>
        }
      />
      <CardMusicItem
        musicName={"TRP LIVE"}
        artwork={
          <DemoAppAlbumCover2>
            <Rectangle825_0001
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/b802/fe12/70b07a6592a33589a9350bb8a5295d9d"
              alt="image of Rectangle825"
            ></Rectangle825_0001>
            <TrpLve>
              TRP
              <br />
              LVE
            </TrpLve>
          </DemoAppAlbumCover2>
        }
      />
    </PrimaryMusicCardsList>
  );
};

const TileMusicItem = ({
  primary = false,
  cover,
}: {
  primary?: boolean;
  cover: JSX.Element;
}) => {
  if (primary) {
    return (
      <Primary>
        <Cover>{cover}</Cover>
        <NonGraphicsArea>
          <InnerFrame>
            <TextInfo>
              <Trippe>TRIPPE</Trippe>
              <MorningSlowbeatsLoFi_0003>
                Morning Slowbeats - LoFi
              </MorningSlowbeatsLoFi_0003>
            </TextInfo>
            <MusicPlayButton_0003
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/56fc/4c35/733e07dee25b0dce8c66a2fb86ef998f"
              alt="icon"
            ></MusicPlayButton_0003>
          </InnerFrame>
        </NonGraphicsArea>
      </Primary>
    );
  } else {
    return (
      <Card1_0001>
        <Contents>
          <Cover_0001>{cover}</Cover_0001>
          <NonGraphicArea>
            <TextInfo_0001>
              <Sweet>Sweet</Sweet>
              <MorningSlowbeatsLoFi_0004>
                Morning Slowbeats - LoFi
              </MorningSlowbeatsLoFi_0004>
            </TextInfo_0001>
            <MusicPlayButton_0004
              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e80e/fc39/da9065547bba86fc0f83f31a4310271c"
              alt="icon"
            ></MusicPlayButton_0004>
          </NonGraphicArea>
        </Contents>
      </Card1_0001>
    );
  }
};

const FriendsMusicSectionPart = () => {
  return (
    <FriendsMusicSection>
      <FriendListeningHeaderText>Lauren is listening</FriendListeningHeaderText>
      <MusicSecondaryList>
        <TileMusicItem
          primary
          cover={
            <>
              <Rectangle825_0002
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/0cf0/7836/f073708c3ceb92d2504f0a572048367b"
                alt="image of Rectangle825"
              ></Rectangle825_0002>
              <TrpLve_0001>
                TRP
                <br />
                LVE
              </TrpLve_0001>
            </>
          }
        />
        <TileMusicItem
          cover={
            <>
              <Rectangle825_0003
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/26c1/ce4d/c339eeaa7bbbdad0c83e2ab036fbfecb"
                alt="image of Rectangle825"
              ></Rectangle825_0003>
              <Union_0001
                src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/6cd5/7710/811330309e1aeaea91da25f5cac2adfd"
                alt="image of Union"
              ></Union_0001>
            </>
          }
        />
        <TileMusicItem
          cover={
            <>
              <Rectangle813_0001></Rectangle813_0001>
              <LoFi_0001>
                LO
                <br />
                FI
              </LoFi_0001>
            </>
          }
        />
      </MusicSecondaryList>
    </FriendsMusicSection>
  );
};

const TabBar = () => {
  return (
    <Footer>
      <TabBarBackground></TabBarBackground>
      <Tabs>
        <TabIcon
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e350/9fb4/422697fd40f9d0f19a35ebbc5df11b57"
          alt="image of IconsMdiHome"
        ></TabIcon>
        <TabIcon
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/1436/9fa1/ba7653876dc7ca8fe523b354816f5319"
          alt="image of IconsMdiShowChart"
        ></TabIcon>
        <TabIcon
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5fda/b17b/6bdba2e87f84c133ad91b1f5c7da0785"
          alt="image of IconsMdiSearch"
        ></TabIcon>
      </Tabs>
    </Footer>
  );
};
`;
/*
const RootWrapperDemoApp = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
\`;

const Body = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
\`;

const TopSpacer = styled.div\`
  height: 64px;
  align-self: stretch;
\`;

const SectionHeader = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 28px 28px 14px;
\`;

const HeaderSection = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 16px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const TitleAndAvatar = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 32px;
  align-self: stretch;
  box-sizing: border-box;
\`;

const Title = styled.span\`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Sen, sans-serif;
  font-weight: 700;
  line-height: 90%;
  text-align: left;
  width: 239px;
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

const PrimaryMusicCardsList = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 16px;
  align-self: stretch;
  box-sizing: border-box;
  padding-bottom: 14px;
  padding-top: 14px;
  padding-left: 28px;
\`;

const Card1 = styled.div\`
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

const DemoAppAlbumCover1 = styled.div\`
  width: 138px;
  height: 144px;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const Rectangle813 = styled.div\`
  width: 138px;
  height: 144px;
  background-color: rgba(0, 0, 0, 1);
  border-radius: 8px;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const LoFi = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Helvetica, sans-serif;
  font-weight: 700;
  line-height: 90%;
  text-align: left;
  position: absolute;
  left: 8px;
  top: 72px;
\`;

const MusicPlayButton = styled.img\`
  width: 28px;
  height: 28px;
  object-fit: cover;
  position: absolute;
  right: 16px;
  bottom: 14px;
\`;

const MorningSlowbeatsLoFi = styled.span\`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const Card2 = styled.div\`
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
  width: 138px;
  height: 144px;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const Rectangle825 = styled.img\`
  width: 138px;
  height: 144px;
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const Union = styled.img\`
  width: 102px;
  height: 104px;
  object-fit: cover;
  position: absolute;
\`;

const MusicPlayButton_0001 = styled.img\`
  width: 28px;
  height: 28px;
  object-fit: cover;
  position: absolute;
  right: 16px;
  bottom: 14px;
\`;

const MorningSlowbeatsLoFi_0001 = styled.span\`
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
  width: 138px;
  height: 144px;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const Rectangle825_0001 = styled.img\`
  width: 138px;
  height: 144px;
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const TrpLve = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 32px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: center;
  min-height: 58px;
  width: 64px;
  position: absolute;
  left: 38px;
  top: 43px;
  height: 58px;
\`;

const MusicPlayButton_0002 = styled.img\`
  width: 28px;
  height: 28px;
  object-fit: cover;
  position: absolute;
  right: 16px;
  bottom: 14px;
\`;

const MorningSlowbeatsLoFi_0002 = styled.span\`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const FriendsMusicSection = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 24px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 28px 28px;
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
  box-shadow: 0px 4px 24px rgba(111, 111, 111, 0.08);
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

const Rectangle825_0002 = styled.img\`
  width: 81px;
  height: 79px;
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const TrpLve_0001 = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: center;
  min-height: 32px;
  width: 37px;
  position: absolute;
  left: 22px;
  top: 24px;
  height: 32px;
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

const MorningSlowbeatsLoFi_0003 = styled.span\`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const MusicPlayButton_0003 = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const Card1_0001 = styled.div\`
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

const Rectangle825_0003 = styled.img\`
  width: 65px;
  height: 65px;
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const Union_0001 = styled.img\`
  width: 47px;
  height: 47px;
  object-fit: cover;
  position: absolute;
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

const MorningSlowbeatsLoFi_0004 = styled.span\`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const MusicPlayButton_0004 = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const Card2_0001 = styled.div\`
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

const DemoAppAlbumCover1_0001 = styled.div\`
  width: 65px;
  height: 65px;
  position: relative;
\`;

const Rectangle813_0001 = styled.div\`
  width: 65px;
  height: 65px;
  background-color: rgba(0, 0, 0, 1);
  border-radius: 8px;
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const LoFi_0001 = styled.span\`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Helvetica, sans-serif;
  font-weight: 700;
  line-height: 90%;
  text-align: left;
  position: absolute;
  left: 4px;
  top: 32px;
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

const MorningSlowbeatsLoFi_0005 = styled.span\`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

const MusicPlayButton_0005 = styled.img\`
  width: 24px;
  height: 24px;
  object-fit: cover;
\`;

const Footer = styled.div\`
  height: 97px;
  position: relative;
  align-self: stretch;
\`;

const Rectangle815 = styled.div\`
  width: 375px;
  height: 97px;
  box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.25);
  background-color: rgba(255, 255, 255, 1);
  position: absolute;
  left: 0px;
  top: 0px;
\`;

const Tabs = styled.div\`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 68px;
  width: 283px;
  height: 24px;
  box-sizing: border-box;
  position: absolute;
  left: 46px;
  top: 29px;
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

export default DemoApp;
`;
*/

export const _DEMO_APP_SRC_FLUTTER = `Column(
  mainAxisSize: MainAxisSize.min,
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    SizedBox(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 375,
            height: 64,
            decoration: BoxDecoration(),
          ),
          SizedBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        child: Row(
                          children: [
                            Text(
                              "Saturday Morning Mix",
                              style: TextStyle(
                                color: Color(
                                  0xff000000,
                                ),
                                fontSize: 36,
                                fontWeight: FontWeight.w700,
                                fontFamily: "Sen",
                              ),
                            ),
                            SizedBox(
                              width: 32,
                            ),
                            Image.network(
                              "grida://assets-reservation/images/1:11",
                              width: 48,
                              height: 48,
                            ),
                          ],
                          crossAxisAlignment: CrossAxisAlignment.start,
                        ),
                      ),
                      SizedBox(
                        height: 16,
                      ),
                      Text(
                        "Here are some tunes for you to start your morning. Mostly quiet and slow-beat, some of them are mood changer.",
                        style: TextStyle(
                          color: Color(
                            0xffa3a3a3,
                          ),
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                          fontFamily: "Roboto",
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            child: Row(
              children: [
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      child: Stack(
                        children: [
                          Positioned(
                            left: 0,
                            top: 0,
                            child: Container(
                              child: Stack(
                                children: [
                                  Positioned(
                                    left: 0,
                                    top: 0,
                                    child: Container(
                                      width: 138.24,
                                      height: 144,
                                      decoration: BoxDecoration(
                                        color: Color(
                                          0xff000000,
                                        ),
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    left: 7.68,
                                    top: 72,
                                    child: Text(
                                      "LO\nFI",
                                      style: TextStyle(
                                        color: Color(
                                          0xffffffff,
                                        ),
                                        fontSize: 36,
                                        fontWeight: FontWeight.w700,
                                        fontFamily: "Helvetica",
                                      ),
                                    ),
                                  ),

                                  /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                                  Container(),
                                ],
                              ),
                              width: 138.24,
                              height: 144,
                            ),
                          ),
                          Positioned(
                            right: 16.24,
                            bottom: 14,
                            child: Image.network(
                              "grida://assets-reservation/images/I1:24;1:103",
                              width: 28,
                              height: 28,
                              semanticLabel: "icon",
                            ),
                          ),

                          /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                          Container(),
                        ],
                      ),
                      width: MediaQuery.of(context).size.width,
                      height: MediaQuery.of(context).size.height,
                    ),
                    SizedBox(
                      height: 4,
                    ),
                    SizedBox(
                      child: Text(
                        "Morning Slowbeats - LoFi",
                        style: TextStyle(
                          color: Color(
                            0xffa3a3a3,
                          ),
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                          fontFamily: "Roboto",
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(
                  width: 16,
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      child: Stack(
                        children: [
                          Positioned(
                            left: 0,
                            top: 0,
                            child: Container(
                              child: Stack(
                                children: [
                                  Positioned(
                                    left: 0,
                                    top: 0,
                                    child: Image.network(
                                      "grida://assets-reservation/images/I1:25;1:101;1:113",
                                      width: 138.24,
                                      height: 144,
                                    ),
                                  ),
                                  Positioned(
                                    child: Image.network(
                                      "grida://assets-reservation/images/I1:25;1:101;1:114",
                                      width: 101.61,
                                      height: 103.93,
                                    ),
                                  ),

                                  /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                                  Container(),
                                ],
                              ),
                              width: 138.24,
                              height: 144,
                            ),
                          ),
                          Positioned(
                            right: 16.24,
                            bottom: 14,
                            child: Image.network(
                              "grida://assets-reservation/images/I1:25;1:103",
                              width: 28,
                              height: 28,
                              semanticLabel: "icon",
                            ),
                          ),

                          /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                          Container(),
                        ],
                      ),
                      width: MediaQuery.of(context).size.width,
                      height: MediaQuery.of(context).size.height,
                    ),
                    SizedBox(
                      height: 4,
                    ),
                    SizedBox(
                      child: Text(
                        "Morning Slowbeats - LoFi",
                        style: TextStyle(
                          color: Color(
                            0xffa3a3a3,
                          ),
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                          fontFamily: "Roboto",
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(
                  width: 16,
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      child: Stack(
                        children: [
                          Positioned(
                            left: 0,
                            top: 0,
                            child: Container(
                              child: Stack(
                                children: [
                                  Positioned(
                                    left: 0,
                                    top: 0,
                                    child: Image.network(
                                      "grida://assets-reservation/images/I1:26;1:101;1:110",
                                      width: 138.24,
                                      height: 144,
                                    ),
                                  ),
                                  Positioned(
                                    left: 38.02,
                                    top: 43.2,
                                    child: Text(
                                      "TRP\nLVE",
                                      style: TextStyle(
                                        color: Color(
                                          0xffffffff,
                                        ),
                                        fontSize: 32.4,
                                        fontWeight: FontWeight.w900,
                                        fontFamily: "Roboto",
                                      ),
                                    ),
                                  ),

                                  /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                                  Container(),
                                ],
                              ),
                              width: 138.24,
                              height: 144,
                            ),
                          ),
                          Positioned(
                            right: 16.24,
                            bottom: 14,
                            child: Image.network(
                              "grida://assets-reservation/images/I1:26;1:103",
                              width: 28,
                              height: 28,
                              semanticLabel: "icon",
                            ),
                          ),

                          /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                          Container(),
                        ],
                      ),
                      width: MediaQuery.of(context).size.width,
                      height: MediaQuery.of(context).size.height,
                    ),
                    SizedBox(
                      height: 4,
                    ),
                    SizedBox(
                      child: Text(
                        "Morning Slowbeats - LoFi",
                        style: TextStyle(
                          color: Color(
                            0xffa3a3a3,
                          ),
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                          fontFamily: "Roboto",
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              crossAxisAlignment: CrossAxisAlignment.start,
            ),
          ),
          SizedBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Lauren is listening",
                  style: TextStyle(
                    color: Color(
                      0xff3a3a3a,
                    ),
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    fontFamily: "Roboto",
                  ),
                ),
                SizedBox(
                  height: 24,
                ),
                SizedBox(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        child: Row(
                          children: [
                            Container(
                              child: Stack(
                                children: [
                                  Positioned(
                                    left: 0,
                                    top: 0,
                                    child: Image.network(
                                      "grida://assets-reservation/images/I1:22;1:78;1:110",
                                      width: 81,
                                      height: 79,
                                    ),
                                  ),
                                  Positioned(
                                    left: 22.28,
                                    top: 23.7,
                                    child: Text(
                                      "TRP\nLVE",
                                      style: TextStyle(
                                        color: Color(
                                          0xffffffff,
                                        ),
                                        fontSize: 18.22,
                                        fontWeight: FontWeight.w900,
                                        fontFamily: "Roboto",
                                      ),
                                    ),
                                  ),

                                  /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                                  Container(),
                                ],
                              ),
                              width: MediaQuery.of(context).size.width,
                              height: MediaQuery.of(context).size.height,
                            ),
                            SizedBox(
                              width: 4,
                            ),
                            SizedBox(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  SizedBox(
                                    child: Row(
                                      children: [
                                        Column(
                                          mainAxisSize: MainAxisSize.min,
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            SizedBox(
                                              child: Text(
                                                "TRIPPE",
                                                style: TextStyle(
                                                  color: Color(
                                                    0xff000000,
                                                  ),
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w900,
                                                  fontFamily: "Roboto",
                                                ),
                                              ),
                                            ),
                                            SizedBox(
                                              height: 5,
                                            ),
                                            SizedBox(
                                              child: Text(
                                                "Morning Slowbeats - LoFi",
                                                style: TextStyle(
                                                  color: Color(
                                                    0x99000000,
                                                  ),
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w400,
                                                  fontFamily: "Roboto",
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        SizedBox(
                                          width: 20,
                                        ),
                                        Image.network(
                                          "grida://assets-reservation/images/I1:22;1:74",
                                          width: 24,
                                          height: 24,
                                          semanticLabel: "icon",
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          crossAxisAlignment: CrossAxisAlignment.start,
                        ),
                      ),
                      SizedBox(
                        height: 12,
                      ),
                      SizedBox(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              child: Row(
                                children: [
                                  Container(
                                    child: Stack(
                                      children: [
                                        Positioned(
                                          left: 0,
                                          top: 0,
                                          child: Image.network(
                                            "grida://assets-reservation/images/I1:27;1:70;1:113",
                                            width: 65,
                                            height: 65,
                                          ),
                                        ),
                                        Positioned(
                                          child: Image.network(
                                            "grida://assets-reservation/images/I1:27;1:70;1:114",
                                            width: 46.57,
                                            height: 47.04,
                                          ),
                                        ),

                                        /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                                        Container(),
                                      ],
                                    ),
                                    width: MediaQuery.of(context).size.width,
                                    height: MediaQuery.of(context).size.height,
                                  ),
                                  SizedBox(
                                    width: 20,
                                  ),
                                  SizedBox(
                                    child: Row(
                                      children: [
                                        SizedBox(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                "Sweet",
                                                style: TextStyle(
                                                  color: Color(
                                                    0xff000000,
                                                  ),
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w900,
                                                  fontFamily: "Roboto",
                                                ),
                                              ),
                                              SizedBox(
                                                height: 5,
                                              ),
                                              SizedBox(
                                                child: Text(
                                                  "Morning Slowbeats - LoFi",
                                                  style: TextStyle(
                                                    color: Color(
                                                      0x99000000,
                                                    ),
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w400,
                                                    fontFamily: "Roboto",
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        SizedBox(
                                          width: 22,
                                        ),
                                        Image.network(
                                          "grida://assets-reservation/images/I1:27;1:71",
                                          width: 24,
                                          height: 24,
                                          semanticLabel: "icon",
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                                crossAxisAlignment: CrossAxisAlignment.start,
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        height: 12,
                      ),
                      SizedBox(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              child: Row(
                                children: [
                                  Container(
                                    child: Stack(
                                      children: [
                                        Positioned(
                                          left: 0,
                                          top: 0,
                                          child: Container(
                                            width: 65,
                                            height: 65,
                                            decoration: BoxDecoration(
                                              color: Color(
                                                0xff000000,
                                              ),
                                            ),
                                          ),
                                        ),
                                        Positioned(
                                          left: 3.61,
                                          top: 32.5,
                                          child: Text(
                                            "LO\nFI",
                                            style: TextStyle(
                                              color: Color(
                                                0xffffffff,
                                              ),
                                              fontSize: 36,
                                              fontWeight: FontWeight.w700,
                                              fontFamily: "Helvetica",
                                            ),
                                          ),
                                        ),

                                        /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
                                        Container(),
                                      ],
                                    ),
                                    width: MediaQuery.of(context).size.width,
                                    height: MediaQuery.of(context).size.height,
                                  ),
                                  SizedBox(
                                    width: 20,
                                  ),
                                  SizedBox(
                                    child: Row(
                                      children: [
                                        SizedBox(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                "Falling",
                                                style: TextStyle(
                                                  color: Color(
                                                    0xff000000,
                                                  ),
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w900,
                                                  fontFamily: "Roboto",
                                                ),
                                              ),
                                              SizedBox(
                                                height: 5,
                                              ),
                                              SizedBox(
                                                child: Text(
                                                  "Morning Slowbeats - LoFi",
                                                  style: TextStyle(
                                                    color: Color(
                                                      0x99000000,
                                                    ),
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w400,
                                                    fontFamily: "Roboto",
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        SizedBox(
                                          width: 22,
                                        ),
                                        Image.network(
                                          "grida://assets-reservation/images/I1:7;1:71",
                                          width: 24,
                                          height: 24,
                                          semanticLabel: "icon",
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                                crossAxisAlignment: CrossAxisAlignment.start,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    Container(
      child: Stack(
        children: [
          Positioned(
            left: 0,
            top: 0,
            child: Container(
              width: 375,
              height: 97,
              decoration: BoxDecoration(
                color: Color(
                  0xffffffff,
                ),
              ),
            ),
          ),
          Positioned(
            left: 46,
            top: 29,
            child: Row(
              children: [
                Image.network(
                  "grida://assets-reservation/images/I1:23;1:54",
                  width: 24,
                  height: 24,
                ),
                SizedBox(
                  width: 68,
                ),
                Image.network(
                  "grida://assets-reservation/images/I1:23;1:57",
                  width: 24,
                  height: 24,
                ),
                SizedBox(
                  width: 68,
                ),
                Image.network(
                  "grida://assets-reservation/images/I1:23;1:60",
                  width: 24,
                  height: 24,
                ),
              ],
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
            ),
          ),

          /// stack requires empty non positioned widget to work properly. refer: https://github.com/flutter/flutter/issues/49631#issuecomment-582090992
          Container(),
        ],
      ),
      width: MediaQuery.of(context).size.width,
      height: MediaQuery.of(context).size.height,
    ),
  ],
);
`;

export const _DEMO_APP_SRC_HTML_ONLY = `<!DOCTYPE html>
<html>
   <body>
      <div id="Wrapper">
         <div id="Body">
            <div id="TopSpacer"></div>
            <div id="SectionHeader">
               <div id="HeaderSection">
                  <div id="TitleAndAvatar">
                     <span id="Title">
                     Saturday Morning Mix
                     </span>
                     <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/4f6b/36d5/17d6b783005c459c272ce5fb879a9e9f"
                        alt="image of AvatarSource"
                        id="AvatarSource"></img>
                  </div>
                  <span id="Subtitle">
                  Here are some tunes for you to start your morning. Mostly quiet and slow-beat, some of them are mood changer.
                  </span>
               </div>
            </div>
            <div id="PrimaryMusicCardsList">
               <div id="Card1">
                  <div id="AlbumArtworkContainer">
                     <div id="DemoAppAlbumCover1">
                        <div id="Rectangle813"></div>
                        <span id="LoFi">
                        LO<br/>
                        FI
                        </span>
                     </div>
                     <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5f4a/558c/5524bce036659c4f82d652b44961d944"
                        alt="icon"
                        id="MusicPlayButton"></img>
                  </div>
                  <span id="MorningSlowbeatsLoFi">
                  Morning Slowbeats - LoFi
                  </span>
               </div>
               <div id="Card2">
                  <div id="AlbumArtworkContainer">
                     <div id="DemoAppAlbumCover3">
                        <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/8a94/bb41/b26e2d09badc33fd87413d2d7cb4f2d6"
                           alt="image of Rectangle825"
                           id="Rectangle825"></img>
                        <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/c86a/b0ec/2cbaa0a2ffcf6665e30c288e0a09bbc4"
                           alt="image of Union"
                           id="Union"></img>
                     </div>
                     <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5f4a/558c/5524bce036659c4f82d652b44961d944"
                        alt="icon"
                        id="MusicPlayButton"></img>
                  </div>
                  <span id="MorningSlowbeatsLoFi_0001">
                  Morning Slowbeats - LoFi
                  </span>
               </div>
               <div id="Card3">
                  <div id="AlbumArtworkContainer">
                     <div id="DemoAppAlbumCover2">
                        <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/b802/fe12/70b07a6592a33589a9350bb8a5295d9d"
                           alt="image of Rectangle825"
                           id="Rectangle825_0001"></img>
                        <span id="TrpLve">
                        TRP<br/>
                        LVE
                        </span>
                     </div>
                     <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5f4a/558c/5524bce036659c4f82d652b44961d944"
                        alt="icon"
                        id="MusicPlayButton"></img>
                  </div>
                  <span id="MorningSlowbeatsLoFi_0002">
                  Morning Slowbeats - LoFi
                  </span>
               </div>
            </div>
            <div id="FriendsMusicSection">
               <span id="FriendListeningHeaderText">
               Lauren is listening
               </span>
               <div id="MusicSecondaryList">
                  <div id="Primary">
                     <div id="Cover">
                        <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/0cf0/7836/f073708c3ceb92d2504f0a572048367b"
                           alt="image of Rectangle825"
                           id="Rectangle825_0002"></img>
                        <span id="TrpLve_0001">
                        TRP<br/>
                        LVE
                        </span>
                     </div>
                     <div id="NonGraphicsArea">
                        <div id="InnerFrame">
                           <div id="TextInfo">
                              <span id="Trippe">
                              TRIPPE
                              </span>
                              <span id="MorningSlowbeatsLoFi_0003">
                              Morning Slowbeats - LoFi
                              </span>
                           </div>
                           <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/56fc/4c35/733e07dee25b0dce8c66a2fb86ef998f"
                              alt="icon"
                              id="MusicPlayButton_0003"></img>
                        </div>
                     </div>
                  </div>
                  <div id="Card1_0001">
                     <div id="Contents">
                        <div id="Cover_0001">
                           <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/26c1/ce4d/c339eeaa7bbbdad0c83e2ab036fbfecb"
                              alt="image of Rectangle825"
                              id="Rectangle825_0003"></img>
                           <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/6cd5/7710/811330309e1aeaea91da25f5cac2adfd"
                              alt="image of Union"
                              id="Union_0001"></img>
                        </div>
                        <div id="NonGraphicArea">
                           <div id="TextInfo_0001">
                              <span id="Sweet">
                              Sweet
                              </span>
                              <span id="MorningSlowbeatsLoFi_0004">
                              Morning Slowbeats - LoFi
                              </span>
                           </div>
                           <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e80e/fc39/da9065547bba86fc0f83f31a4310271c"
                              alt="icon"
                              id="MusicPlayButton_0004"></img>
                        </div>
                     </div>
                  </div>
                  <div id="Card2_0001">
                     <div id="Contents_0001">
                        <div id="DemoAppAlbumCover1_0001">
                           <div id="Rectangle813_0001"></div>
                           <span id="LoFi_0001">
                           LO<br/>
                           FI
                           </span>
                        </div>
                        <div id="NonGraphicArea_0001">
                           <div id="TextInfo_0002">
                              <span id="Sweet_0001">
                              Falling
                              </span>
                              <span id="MorningSlowbeatsLoFi_0005">
                              Morning Slowbeats - LoFi
                              </span>
                           </div>
                           <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e80e/fc39/da9065547bba86fc0f83f31a4310271c"
                              alt="icon"
                              id="MusicPlayButton_0005"></img>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
         <div id="Footer">
            <div id="Rectangle815"></div>
            <div id="Tabs">
               <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e350/9fb4/422697fd40f9d0f19a35ebbc5df11b57"
                  alt="image of IconsMdiHome"
                  id="IconsMdiHome"></img>
               <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/1436/9fa1/ba7653876dc7ca8fe523b354816f5319"
                  alt="image of IconsMdiShowChart"
                  id="IconsMdiShowChart"></img>
               <img src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/5fda/b17b/6bdba2e87f84c133ad91b1f5c7da0785"
                  alt="image of IconsMdiSearch"
                  id="IconsMdiSearch"></img>
            </div>
         </div>
      </div>
   </body>
</html>`;
