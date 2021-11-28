import styled from "@emotion/styled";
import React from "react";

import { Tabs } from "components/landingpage/tab-featured-menu";
import { k } from "sections";

import { TabsList } from "./tabs";

export default function SectionBornToBeHeadless1280SizeLg() {
  return (
    <RootWrapperSectionBornToBeHeadless1280SizeLg>
      <Frame623>
        <BornToBeHeadless>
          {k.contents.heading2_born_to_be_headless}
        </BornToBeHeadless>
        <WipToTruelyHelpYourProductivityWeAreDesignedHeadlessGridaSHeadlessDesignEnablesYouEvenFasterDevelopmentItSTheEndOfSwitchingTabs>
          WIP - To truely help your productivity, we are designed headless.
          Grida’s Headless design enables you even faster development. It’s the
          end of switching tabs
        </WipToTruelyHelpYourProductivityWeAreDesignedHeadlessGridaSHeadlessDesignEnablesYouEvenFasterDevelopmentItSTheEndOfSwitchingTabs>
      </Frame623>
      <DemoArea>
        <SwitchContainer>
          <Tabs theme="dark" tabs={TabsList} initialSelection="vscode" />
        </SwitchContainer>
        <DemoContentArea>
          <CodeFrame>
            <Frame566>
              <BaseVscodeTab>
                <Frame565>
                  <PlatformIconsDummyDefault
                    src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
                    alt="icon"
                  ></PlatformIconsDummyDefault>
                  <FileNameTxt>React.tsx</FileNameTxt>
                </Frame565>
              </BaseVscodeTab>
              <BaseVscodeTab_0001>
                <Frame565_0001>
                  <PlatformIconsDummyDefault_0001
                    src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
                    alt="icon"
                  ></PlatformIconsDummyDefault_0001>
                  <FileNameTxt_0001>Vue.vue</FileNameTxt_0001>
                </Frame565_0001>
              </BaseVscodeTab_0001>
              <BaseVscodeTab_0002>
                <Frame565_0002>
                  <PlatformIconsDummyDefault_0002
                    src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
                    alt="icon"
                  ></PlatformIconsDummyDefault_0002>
                  <FileNameTxt_0002>Flutter.dart</FileNameTxt_0002>
                </Frame565_0002>
              </BaseVscodeTab_0002>
              <BaseVscodeTab_0003>
                <Frame565_0003>
                  <PlatformIconsDummyDefault_0003
                    src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
                    alt="icon"
                  ></PlatformIconsDummyDefault_0003>
                  <FileNameTxt_0003>vanilla.html</FileNameTxt_0003>
                </Frame565_0003>
              </BaseVscodeTab_0003>
              <BaseVscodeTab_0004>
                <Frame565_0004>
                  <PlatformIconsDummyDefault_0004
                    src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/cecd/8d50/1f5569ac66c9ba6f70c1fb403ff58bfe"
                    alt="icon"
                  ></PlatformIconsDummyDefault_0004>
                  <FileNameTxt_0004>module.css</FileNameTxt_0004>
                </Frame565_0004>
              </BaseVscodeTab_0004>
            </Frame566>
            <_123456789101112131415161718192021222324252627282930>
              1<br />
              2<br />
              3<br />
              4<br />
              5<br />
              6<br />
              7<br />
              8<br />
              9<br />
              10
              <br />
              11
              <br />
              12
              <br />
              13
              <br />
              14
              <br />
              15
              <br />
              16
              <br />
              17
              <br />
              18
              <br />
              19
              <br />
              20
              <br />
              21
              <br />
              22
              <br />
              23
              <br />
              24
              <br />
              25
              <br />
              26
              <br />
              27
              <br />
              28
              <br />
              29
              <br />
              30
            </_123456789101112131415161718192021222324252627282930>
          </CodeFrame>
          <ActionArea>
            <ActionLink>
              <BaseActionLink>
                <Frame245>
                  <ActionLink_0001>Get the VSCode Extension</ActionLink_0001>
                  <IconsMdiKeyboardArrowRight
                    src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/d189/6a6e/14107ad4de73d24b574dcd43a88d2785"
                    alt="image of IconsMdiKeyboardArrowRight"
                  ></IconsMdiKeyboardArrowRight>
                </Frame245>
              </BaseActionLink>
            </ActionLink>
          </ActionArea>
        </DemoContentArea>
      </DemoArea>
    </RootWrapperSectionBornToBeHeadless1280SizeLg>
  );
}

const RootWrapperSectionBornToBeHeadless1280SizeLg = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 86px;
  min-height: 100vh;
  background-color: rgba(48, 50, 52, 1);
  box-sizing: border-box;
  padding: 100px 0px 140px;
`;

const Frame623 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 26px;
  align-self: stretch;
  box-sizing: border-box;
`;

const BornToBeHeadless = styled.span`
  color: rgba(222, 222, 222, 1);
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  line-height: 98%;
  text-align: center;
  width: 518px;
`;

const WipToTruelyHelpYourProductivityWeAreDesignedHeadlessGridaSHeadlessDesignEnablesYouEvenFasterDevelopmentItSTheEndOfSwitchingTabs = styled.span`
  color: rgba(161, 162, 162, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  line-height: 160%;
  text-align: center;
  width: 780px;
`;

const DemoArea = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 80px;
  align-self: stretch;
  box-sizing: border-box;
  padding-left: 80px;
`;

const SwitchContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 352px;
  height: 486px;
  box-sizing: border-box;
  padding: 24px 10px;
`;

const Switches = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 27px;
  width: 332px;
  height: 438px;
  box-sizing: border-box;
`;

const BaseTabFeaturedMenu = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 332px;
  height: 66px;
  box-sizing: border-box;
`;

const BaseTabFeaturedMenu_0001 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  box-shadow: 0px 4px 32px rgba(0, 0, 0, 0.04);
  border-left: solid 1px rgba(58, 58, 58, 1);
  border-top: solid 1px rgba(58, 58, 58, 1);
  border-bottom: solid 1px rgba(58, 58, 58, 1);
  border-right: solid 1px rgba(58, 58, 58, 1);
  border-radius: 4px;
  width: 332px;
  height: 66px;
  background-color: rgba(46, 46, 46, 1);
  box-sizing: border-box;
  padding: 16px 21px;
`;

const Frame575 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 16px;
  width: 126px;
  height: 34px;
  box-sizing: border-box;
`;

const PlatformIconsVscodeDefault = styled.div`
  width: 32px;
  height: 32px;
  position: relative;
`;

const Image105 = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Title = styled.span`
  color: rgba(135, 135, 135, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  line-height: 160%;
  text-align: left;
`;

const BaseTabFeaturedMenu_0002 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 332px;
  height: 66px;
  box-sizing: border-box;
`;

const BaseTabFeaturedMenu_0003 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 332px;
  height: 66px;
  background-color: rgba(48, 50, 52, 1);
  box-sizing: border-box;
  padding: 16px 21px;
`;

const Frame575_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 16px;
  width: 198px;
  height: 34px;
  box-sizing: border-box;
`;

const PlatformIconsFigmaDefault = styled.div`
  width: 32px;
  height: 32px;
  overflow: hidden;
  position: relative;
`;

const Image71 = styled.img`
  object-fit: cover;
  position: absolute;
  left: 6px;
  top: 0px;
  right: 5px;
  bottom: 0px;
`;

const Title_0001 = styled.span`
  color: rgba(135, 135, 135, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  line-height: 160%;
  text-align: left;
`;

const BaseTabFeaturedMenu_0004 = styled.em`
  color: red;
`;

const BaseTabFeaturedMenu_0005 = styled.em`
  color: red;
`;

const BaseTabFeaturedMenu_0006 = styled.em`
  color: red;
`;

const DemoContentArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 768px;
  height: 626px;
  box-sizing: border-box;
`;

const CodeFrame = styled.div`
  height: 567px;
  overflow: hidden;
  background-color: rgba(30, 30, 30, 1);
  border-radius: 12px;
  position: relative;
  box-shadow: 0px 4px 24px rgba(0, 0, 0, 0.12);
  align-self: stretch;
`;

const Frame566 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 0;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  width: 600px;
  height: 36px;
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

const PlatformIconsDummyDefault = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const FileNameTxt = styled.span`
  color: rgba(236, 236, 236, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0001 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 107px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
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
  width: 67px;
  height: 16px;
  box-sizing: border-box;
`;

const PlatformIconsDummyDefault_0001 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const FileNameTxt_0001 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0002 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 123px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
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
  width: 83px;
  height: 16px;
  box-sizing: border-box;
`;

const PlatformIconsDummyDefault_0002 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const FileNameTxt_0002 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0003 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 126px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const Frame565_0003 = styled.div`
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

const PlatformIconsDummyDefault_0003 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const FileNameTxt_0003 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const BaseVscodeTab_0004 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 128px;
  height: 36px;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding: 14px 20px;
`;

const Frame565_0004 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 88px;
  height: 16px;
  box-sizing: border-box;
`;

const PlatformIconsDummyDefault_0004 = styled.img`
  width: 14px;
  height: 14px;
  object-fit: cover;
`;

const FileNameTxt_0004 = styled.span`
  color: rgba(141, 142, 144, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const _123456789101112131415161718192021222324252627282930 = styled.span`
  color: rgba(160, 161, 166, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: Monaco, sans-serif;
  font-weight: 400;
  line-height: 24px;
  text-align: right;
  position: absolute;
  left: 37px;
  top: 63px;
`;

const ActionArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 217px;
  height: 49px;
  box-sizing: border-box;
  padding: 10px 36px;
`;

const ActionLink = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 145px;
  height: 29px;
  box-sizing: border-box;
`;

const BaseActionLink = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 8px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Frame245 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 4px;
  align-self: stretch;
  box-sizing: border-box;
`;

const ActionLink_0001 = styled.span`
  color: rgba(125, 125, 125, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const IconsMdiKeyboardArrowRight = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;
