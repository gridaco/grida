import styled from "@emotion/styled";
import React from "react";

import { HeadingGradient } from "./styles/heading";

export default function DesignOnceRunAnywhere320SizeXs() {
  return (
    <RootWrapperDesignOnceRunAnywhere320SizeXs>
      <Contents>
        <Spacer></Spacer>
        <Heading1>Design once, Run anywhere.</Heading1>
        <VscodeDemo>
          <Container>
            <WindowHandle>
              <Controls>
                <Close></Close>
                <Minimize></Minimize>
                <Fullscreen></Fullscreen>
              </Controls>
            </WindowHandle>
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
        </VscodeDemo>
      </Contents>
    </RootWrapperDesignOnceRunAnywhere320SizeXs>
  );
}

const RootWrapperDesignOnceRunAnywhere320SizeXs = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  gap: 10px;
  min-height: 100vh;
  background: linear-gradient(180deg, rgba(0, 0, 0, 1), rgba(0, 87, 255, 0));
  box-sizing: border-box;
`;

const Contents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 55px;
  width: 320px;
  height: 897px;
  box-sizing: border-box;
  padding: 0px 20px 24px;
`;

const Spacer = styled.div`
  width: 1px;
  height: 1px;
`;

const Heading1 = styled.span`
  text-overflow: ellipsis;
  font-size: 32px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -1px;
  ${HeadingGradient}
  text-align: center;
  width: 280px;
`;

const VscodeDemo = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  box-shadow: 0px 12px 32px 2px rgba(0, 0, 0, 0.48);
  border: solid 1px rgba(69, 69, 69, 1);
  border-radius: 10px;
  align-self: stretch;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
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

const WindowHandle = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  border-radius: 10px;
  align-self: stretch;
  background-color: rgba(60, 60, 60, 1);
  box-sizing: border-box;
  padding-bottom: 8px;
  padding-top: 6px;
  padding-left: 9px;
  padding-right: 56px;
`;

const Controls = styled.div`
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

const Close = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(236, 106, 95, 1);
  border-radius: 6px;
`;

const Minimize = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(245, 191, 79, 1);
  border-radius: 6px;
`;

const Fullscreen = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(98, 198, 85, 1);
  border-radius: 6px;
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
  border: solid 1px rgba(235, 235, 235, 1);
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
