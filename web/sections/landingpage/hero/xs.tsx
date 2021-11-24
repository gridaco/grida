import styled from "@emotion/styled";
import React from "react";

export default function Hero320SizeXs() {
  return (
    <RootWrapperHero320SizeXs>
      <_1440SizeXl>
        <BlurEffectBg>
          <GradientLiveArtwork
            src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/209d/e4a2/57f702bfc430d87427a5225fa94a6d54"
            alt="image of GradientLiveArtwork"
          ></GradientLiveArtwork>
        </BlurEffectBg>
        <Contents>
          <Frame501>
            <HeroTextAreaWithCta>
              <Heading1>Figma to Code.</Heading1>
              <DescriptionHolder>
                <HeroBodyText>
                  The Final, Open-sourced Design to code solution.
                </HeroBodyText>
              </DescriptionHolder>
            </HeroTextAreaWithCta>
          </Frame501>
          <Frame555>
            <HeroPrimaryInput>
              <EnterYourFigmaDesignUrl>
                Enter your Figma design url
              </EnterYourFigmaDesignUrl>
            </HeroPrimaryInput>
            <HeroPrimaryButton>
              <Frame551>
                <ToCode>To Code</ToCode>
              </Frame551>
            </HeroPrimaryButton>
          </Frame555>
        </Contents>
      </_1440SizeXl>
      <Frame582>
        <Group532>
          <Line64></Line64>
          <Line67></Line67>
          <Line65></Line65>
          <Line66></Line66>
        </Group532>
        <Heading1_0001>Design once, Run anywhere.</Heading1_0001>
        <Blank>
          <Frame608>
            <Frame607>
              <Ellipse60></Ellipse60>
              <Ellipse61></Ellipse61>
              <Ellipse62></Ellipse62>
            </Frame607>
          </Frame608>
          <Container>
            <Sidebar>
              <IPhone11ProX1></IPhone11ProX1>
            </Sidebar>
            <Editor>
              <TabsHeader>
                <TabsHeader_0001>
                  <Tabs>
                    <VscodeTab>
                      <BaseVscodeTab>
                        <Frame565>
                          <PlatformIconsReactDefault
                            src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/b46a/1396/35aa8c273ddaf01bcfbbfe0e9bca7052"
                            alt="icon"
                          ></PlatformIconsReactDefault>
                          <FileNameTxt>React.tsx</FileNameTxt>
                        </Frame565>
                      </BaseVscodeTab>
                    </VscodeTab>
                    <VscodeTab_0001>
                      <BaseVscodeTab_0001>
                        <Frame565_0001>
                          <PlatformIconsFlutterGrey>
                            <Image73
                              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/071c/39a6/1f73ef26c0bfc2009e19504d359b2b9b"
                              alt="image of Image73"
                            ></Image73>
                          </PlatformIconsFlutterGrey>
                          <FileNameTxt_0001>Flutter.dart</FileNameTxt_0001>
                        </Frame565_0001>
                      </BaseVscodeTab_0001>
                    </VscodeTab_0001>
                    <VscodeTab_0002>
                      <BaseVscodeTab_0002>
                        <Frame565_0002>
                          <PlatformIconsHtmlGrey>
                            <Image76
                              src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e1a2/daa4/941e1391d393346fa179752b9a86be99"
                              alt="image of Image76"
                            ></Image76>
                          </PlatformIconsHtmlGrey>
                          <FileNameTxt_0002>vanilla.html</FileNameTxt_0002>
                        </Frame565_0002>
                      </BaseVscodeTab_0002>
                    </VscodeTab_0002>
                  </Tabs>
                </TabsHeader_0001>
              </TabsHeader>
              <Editor_0001></Editor_0001>
            </Editor>
          </Container>
          <StatusBar>
            <StatusBar_0001>
              <Rectangle105></Rectangle105>
              <Left>
                <Item>
                  <ItemBase>
                    <Icon></Icon>
                    <Text>main</Text>
                  </ItemBase>
                </Item>
                <Item_0001>
                  <ItemBase_0001>
                    <Icon_0001></Icon_0001>
                    <Text_0001>0↓ 1↑</Text_0001>
                  </ItemBase_0001>
                </Item_0001>
              </Left>
              <Right></Right>
            </StatusBar_0001>
          </StatusBar>
        </Blank>
      </Frame582>
    </RootWrapperHero320SizeXs>
  );
}

const RootWrapperHero320SizeXs = styled.div`
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
`;

const _1440SizeXl = styled.div`
  height: 657px;
  background-color: rgba(255, 255, 255, 1);
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
`;

const BlurEffectBg = styled.div`
  width: 236px;
  height: 136px;
  position: absolute;
  left: 308px;
  top: 51px;
`;

const GradientLiveArtwork = styled.img`
  width: 236px;
  height: 136px;
  object-fit: cover;
  position: absolute;
  right: 0px;
  bottom: 0px;
  filter: blur(252.78px);
`;

const Contents = styled.div`
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

const Frame501 = styled.div`
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

const HeroTextAreaWithCta = styled.div`
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

const Frame555 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 14px;
  align-self: stretch;
  box-sizing: border-box;
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

const EnterYourFigmaDesignUrl = styled.span`
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

const Frame551 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 66px;
  height: 18px;
  box-sizing: border-box;
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

const Frame582 = styled.div`
  height: 929px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(0, 0, 0, 1), rgba(0, 87, 255, 0));
  position: absolute;
  left: 0px;
  top: 657px;
  right: 0px;
`;

const Group532 = styled.div`
  width: 1582px;
  height: 1071px;
  position: absolute;
  left: -151px;
  top: -34px;
`;

const Line64 = styled.div`
  width: 1020px;
  height: 1020px;
  border-left: solid 1px rgba(79, 71, 136, 0.3);
  border-top: solid 1px rgba(79, 71, 136, 0.3);
  border-bottom: solid 1px rgba(79, 71, 136, 0.3);
  border-right: solid 1px rgba(79, 71, 136, 0.3);
  position: absolute;
  left: 562px;
  top: 51px;
  transform: rotate(225deg);
`;

const Line67 = styled.div`
  width: 1020px;
  height: 1020px;
  border-left: solid 1px rgba(79, 71, 136, 0.3);
  border-top: solid 1px rgba(79, 71, 136, 0.3);
  border-bottom: solid 1px rgba(79, 71, 136, 0.3);
  border-right: solid 1px rgba(79, 71, 136, 0.3);
  position: absolute;
  left: 117px;
  top: 21px;
  transform: rotate(225deg);
`;

const Line65 = styled.div`
  width: 1014px;
  height: 1014px;
  border-left: solid 1px rgba(79, 71, 136, 0.3);
  border-top: solid 1px rgba(79, 71, 136, 0.3);
  border-bottom: solid 1px rgba(79, 71, 136, 0.3);
  border-right: solid 1px rgba(79, 71, 136, 0.3);
  position: absolute;
  left: 518px;
  top: 0px;
  transform: rotate(135deg);
`;

const Line66 = styled.div`
  width: 1014px;
  height: 1014px;
  border-left: solid 1px rgba(79, 71, 136, 0.3);
  border-top: solid 1px rgba(79, 71, 136, 0.3);
  border-bottom: solid 1px rgba(79, 71, 136, 0.3);
  border-right: solid 1px rgba(79, 71, 136, 0.3);
  position: absolute;
  left: 0px;
  top: 0px;
  transform: rotate(135deg);
`;

const Heading1_0001 = styled.span`
  text-overflow: ellipsis;
  font-size: 32px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 98%;
  text-align: center;
  width: 280px;
  position: absolute;
  left: calc((calc((50% + 0px)) - 140px));
  top: 56px;
`;

const Blank = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 0;
  box-shadow: 0px 12px 32px 2px rgba(0, 0, 0, 0.48);
  border-left: solid 1px rgba(69, 69, 69, 1);
  border-top: solid 1px rgba(69, 69, 69, 1);
  border-bottom: solid 1px rgba(69, 69, 69, 1);
  border-right: solid 1px rgba(69, 69, 69, 1);
  border-radius: 10px;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
  position: absolute;
  left: 20px;
  top: 172px;
  right: 20px;
  height: 726px;
`;

const Frame608 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  background-color: rgba(60, 60, 60, 1);
  box-sizing: border-box;
  padding-bottom: 8px;
  padding-top: 6px;
  padding-left: 9px;
  padding-right: 56px;
`;

const Frame607 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 7px;
  width: 50px;
  height: 12px;
  box-sizing: border-box;
`;

const Ellipse60 = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(236, 106, 95, 1);
  border-radius: 6px;
`;

const Ellipse61 = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(245, 191, 79, 1);
  border-radius: 6px;
`;

const Ellipse62 = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(98, 198, 85, 1);
  border-radius: 6px;
`;

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const Sidebar = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
  padding: 24px 24px 0px;
`;

const IPhone11ProX1 = styled.div`
  width: 231px;
  height: 501px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border-left: solid 1px rgba(235, 235, 235, 1);
  border-top: solid 1px rgba(235, 235, 235, 1);
  border-bottom: solid 1px rgba(235, 235, 235, 1);
  border-right: solid 1px rgba(235, 235, 235, 1);
  position: relative;
  box-shadow: 0px 2px 39px 5px rgba(146, 146, 146, 0.12);
`;

const Editor = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const TabsHeader = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 0;
  align-self: stretch;
`;

const TabsHeader_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 54px;
  align-self: stretch;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
`;

const Tabs = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 1px;
  align-self: stretch;
  box-sizing: border-box;
`;

const VscodeTab = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const BaseVscodeTab = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 116px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const Frame565 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 76px;
  height: 16px;
  box-sizing: border-box;
`;

const PlatformIconsReactDefault = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const FileNameTxt = styled.span`
  color: rgba(254, 254, 254, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const VscodeTab_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const BaseVscodeTab_0001 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 123px;
  height: 36px;
  background-color: rgba(45, 45, 45, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const Frame565_0001 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 83px;
  height: 16px;
  box-sizing: border-box;
`;

const PlatformIconsFlutterGrey = styled.div`
  width: 14px;
  height: 14px;
  overflow: hidden;
  position: relative;
`;

const Image73 = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const FileNameTxt_0001 = styled.span`
  color: rgba(119, 119, 119, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const VscodeTab_0002 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const BaseVscodeTab_0002 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 126px;
  height: 36px;
  background-color: rgba(45, 45, 45, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const Frame565_0002 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 86px;
  height: 16px;
  box-sizing: border-box;
`;

const PlatformIconsHtmlGrey = styled.div`
  width: 14px;
  height: 14px;
  overflow: hidden;
  position: relative;
`;

const Image76 = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const FileNameTxt_0002 = styled.span`
  color: rgba(119, 119, 119, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Editor_0001 = styled.div`
  width: 722px;
  height: 626px;
  overflow: hidden;
  background-color: rgba(30, 30, 30, 1);
  position: relative;
`;

const StatusBar = styled.div`
  height: 22px;
  position: relative;
  align-self: stretch;
`;

const StatusBar_0001 = styled.div`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Rectangle105 = styled.div`
  background-color: rgba(51, 51, 51, 1);
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Left = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 8px;
  box-sizing: border-box;
  position: absolute;
  left: 8px;
  top: calc((calc((50% + 0px)) - 11px));
  width: 124px;
  height: 22px;
`;

const Item = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 0;
  width: 54px;
  height: 22px;
  box-sizing: border-box;
`;

const ItemBase = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  width: 54px;
  height: 22px;
  box-sizing: border-box;
  padding: 4px 4px;
`;

const Icon = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Text = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: "SF Pro Text", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const Item_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 0;
  width: 62px;
  height: 22px;
  box-sizing: border-box;
`;

const ItemBase_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  width: 62px;
  height: 22px;
  box-sizing: border-box;
  padding: 4px 4px;
`;

const Icon_0001 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Text_0001 = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: "SF Pro Text", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const Right = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 8px;
  box-sizing: border-box;
  position: absolute;
  top: calc((calc((50% + 0px)) - 11px));
  right: 8px;
  width: 371px;
  height: 22px;
`;
