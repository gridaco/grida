import styled from "@emotion/styled";
import React from "react";

export default function MusicHome({ scale = 1 }: { scale?: number }) {
  return (
    <Wrapper scale={scale}>
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
            src="/demo-app-wnv/avatar-source.png"
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
        <MusicPlayButtonWrapperPositionerInAlbumCoverCard>
          <MusicPlayButton />
        </MusicPlayButtonWrapperPositionerInAlbumCoverCard>
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
          <>
            <DemoAppAlbumCover1>
              <Rectangle813></Rectangle813>
              <LoFi>
                LO
                <br />
                FI
              </LoFi>
            </DemoAppAlbumCover1>
            <MusicPlayButtonWrapperPositionerInAlbumCoverCard>
              <MusicPlayButton color="white" />
            </MusicPlayButtonWrapperPositionerInAlbumCoverCard>
          </>
        }
      />
      <CardMusicItem
        musicName={"Sweet nothings"}
        artwork={
          <DemoAppAlbumCover3>
            <Rectangle825
              src="/demo-app-wnv/album-cover-2.png"
              alt="image of Rectangle825"
            ></Rectangle825>
          </DemoAppAlbumCover3>
        }
      />
      <CardMusicItem
        musicName={"TRP LIVE"}
        artwork={
          <DemoAppAlbumCover2>
            <Rectangle825_0001
              src="/demo-app-wnv/album-cover-3.png"
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
            <MusicPlayButton />
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
            <MusicPlayButton />
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
                src="/demo-app-wnv/album-cover-2.png"
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
                src="/demo-app-wnv/album-cover-3.png"
                alt="image of Rectangle825"
              ></Rectangle825_0003>
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

const Wrapper = styled.div<{
  scale: number;
}>`
  display: flex;
  width: 375px;
  height: 812px;
  transform: scale(${p => p.scale});
  transform-origin: left top;
  overflow: hidden;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 0;
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
`;

const Body = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const TopSpacer = styled.div`
  height: 64px;
  align-self: stretch;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 28px 28px 14px;
`;

const HeaderSection = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 16px;
  align-self: stretch;
  box-sizing: border-box;
`;

const TitleAndAvatar = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 32px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Title = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Sen, sans-serif;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 90%;
  text-align: left;
  width: 239px;
`;

const AvatarSource = styled.img`
  width: 48px;
  height: 48px;
  object-fit: cover;
`;

const Subtitle = styled.span`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  width: 315px;
`;

const PrimaryMusicCardsList = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 16px;
  align-self: stretch;
  box-sizing: border-box;
  padding-bottom: 14px;
  padding-top: 14px;
  padding-left: 28px;
`;

const CardWrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 4px;
  width: 138px;
  height: 180px;
  box-sizing: border-box;
`;

const ArtworkContainer = styled.div`
  height: 144px;
  position: relative;
  align-self: stretch;
`;

const DemoAppAlbumCover1 = styled.div`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Rectangle813 = styled.div`
  background-color: rgba(0, 0, 0, 1);
  border-radius: 8px;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const LoFi = styled.span`
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
`;

const MusicPlayButton = ({ color = "black" }: { color?: string }) => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g filter="url(#filter0_b_1_79)">
        <circle cx="12" cy="12" r="11" stroke="black" stroke-width="2" />
      </g>
      <path
        d="M9.33325 7.33337V16.6667L16.6666 12L9.33325 7.33337Z"
        fill={color}
      />
      <defs>
        <filter
          id="filter0_b_1_79"
          x="-16"
          y="-16"
          width="56"
          height="56"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImage" stdDeviation="8" />
          <feComposite
            in2="SourceAlpha"
            operator="in"
            result="effect1_backgroundBlur_1_79"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_backgroundBlur_1_79"
            result="shape"
          />
        </filter>
      </defs>
    </svg>
  );
};

const MusicPlayButtonWrapperPositionerInAlbumCoverCard = styled.div`
  width: 28px;
  height: 28px;
  position: absolute;
  right: 16px;
  bottom: 14px;
`;

const MusicName = styled.span`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
`;

const DemoAppAlbumCover3 = styled.div`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Rectangle825 = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Union = styled.img`
  object-fit: cover;
  position: absolute;
  left: 17px;
  top: 19px;
  right: 19px;
  bottom: 22px;
`;

const DemoAppAlbumCover2 = styled.div`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Rectangle825_0001 = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const TrpLve = styled.span`
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
`;

const MusicPlayButton_0002 = styled.img`
  width: 28px;
  height: 28px;
  object-fit: cover;
  position: absolute;
  right: 16px;
  bottom: 14px;
`;

const MorningSlowbeatsLoFi_0002 = styled.span`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
`;

const FriendsMusicSection = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 24px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 28px 28px;
`;

const FriendListeningHeaderText = styled.span`
  color: rgba(58, 58, 58, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
  width: 232px;
`;

const MusicSecondaryList = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 12px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Primary = styled.div`
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
`;

const Cover = styled.div`
  width: 81px;
  position: relative;
  align-self: stretch;
`;

const Rectangle825_0002 = styled.img`
  object-fit: cover;
  position: absolute;
  width: 80px;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const TrpLve_0001 = styled.span`
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
`;

const NonGraphicsArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 10px 10px;
`;

const InnerFrame = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 20px;
  align-self: stretch;
  box-sizing: border-box;
  padding-right: 12px;
`;

const TextInfo = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 5px;
  width: 158px;
  height: 59px;
  box-sizing: border-box;
`;

const Trippe = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
  align-self: stretch;
`;

const MorningSlowbeatsLoFi_0003 = styled.span`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
`;

const MusicPlayButton_0003 = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;

const Card1_0001 = styled.div`
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
`;

const Contents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 20px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Cover_0001 = styled.div`
  width: 65px;
  height: 65px;
  position: relative;
`;

const Rectangle825_0003 = styled.img`
  object-fit: cover;
  position: absolute;
  width: 64px;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const NonGraphicArea = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 22px;
  align-self: stretch;
  box-sizing: border-box;
  padding-right: 8px;
`;

const TextInfo_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 5px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Sweet = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Roboto, sans-serif;
  font-weight: 900;
  line-height: 90%;
  text-align: left;
`;

const MorningSlowbeatsLoFi_0004 = styled.span`
  color: rgba(0, 0, 0, 0.6);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
`;

const MusicPlayButton_0004 = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;

const Rectangle813_0001 = styled.div`
  background-color: rgba(0, 0, 0, 1);
  border-radius: 8px;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const LoFi_0001 = styled.span`
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
`;

const Footer = styled.div`
  height: 97px;
  position: relative;
  align-self: stretch;
`;

const TabBarBackground = styled.div`
  box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.25);
  background-color: rgba(255, 255, 255, 1);
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Tabs = styled.div`
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
`;

const TabIcon = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;
