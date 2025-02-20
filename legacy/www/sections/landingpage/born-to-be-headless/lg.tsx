import styled from "@emotion/styled";
import React from "react";

export default function SectionBornToBeHeadless1280SizeLg() {
  return (
    <RootWrapperSectionBornToBeHeadless1280SizeLg>
      <HeaderArea>
        <Heading>Born to be Headless</Heading>
        <Desc>
          WIP - To truely help your productivity, we are designed headless.
          Grida’s Headless design enables you even faster development. It’s the
          end of switching tabs
        </Desc>
      </HeaderArea>
      <DemoArea>
        <SwitchContainer>
          <Switches>
            <TabFeaturedMenu>
              <BaseTabFeaturedMenu>
                <Contents>
                  <PlatformIconsVscodeDefault>
                    <Image105
                      src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/e3ff/831f/3cb3b4e0ed91094328836f91eedc0daa"
                      alt="image of Image105"
                    ></Image105>
                  </PlatformIconsVscodeDefault>
                  <Title>VSCode</Title>
                </Contents>
              </BaseTabFeaturedMenu>
            </TabFeaturedMenu>
            <TabFeaturedMenu_0001>
              <BaseTabFeaturedMenu_0001>
                <Contents_0001>
                  <PlatformIconsFigmaDefault>
                    <Image71
                      src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/2157/072a/504a0c5562d01327a8222df5dc7f655e"
                      alt="image of Image71"
                    ></Image71>
                  </PlatformIconsFigmaDefault>
                  <Title_0001>Figma Assistant</Title_0001>
                </Contents_0001>
              </BaseTabFeaturedMenu_0001>
            </TabFeaturedMenu_0001>
            <TabFeaturedMenu_0002>
              {
                'The input design was not handled. "tab-featured-menu" type of "undefined" - {"id":"7298:72660","originName":"tab-featured-menu"}'
              }
            </TabFeaturedMenu_0002>
            <TabFeaturedMenu_0003>
              {
                'The input design was not handled. "tab-featured-menu" type of "undefined" - {"id":"7298:72661","originName":"tab-featured-menu"}'
              }
            </TabFeaturedMenu_0003>
            <TabFeaturedMenu_0004>
              {
                'The input design was not handled. "tab-featured-menu" type of "undefined" - {"id":"7298:72662","originName":"tab-featured-menu"}'
              }
            </TabFeaturedMenu_0004>
          </Switches>
        </SwitchContainer>
        <DemoContentArea>
          <Demo></Demo>
          <ActionArea>
            <ActionLink>
              <BaseActionLink>
                <Contents_0002>
                  <Label>Get the VSCode Extension</Label>
                  <IconsMdiKeyboardArrowRight
                    src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/d189/6a6e/14107ad4de73d24b574dcd43a88d2785"
                    alt="image of IconsMdiKeyboardArrowRight"
                  ></IconsMdiKeyboardArrowRight>
                </Contents_0002>
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

const HeaderArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 26px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Heading = styled.span`
  color: rgba(222, 222, 222, 1);
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Inter", sans-serif;
  font-weight: 700;
  line-height: 98%;
  text-align: center;
  width: 518px;
`;

const Desc = styled.span`
  color: rgba(161, 162, 162, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Inter", sans-serif;
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

const TabFeaturedMenu = styled.div`
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

const BaseTabFeaturedMenu = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  box-shadow: 0px 4px 32px rgba(0, 0, 0, 0.04);
  border: solid 1px rgba(58, 58, 58, 1);
  border-radius: 4px;
  width: 332px;
  height: 66px;
  background-color: rgba(46, 46, 46, 1);
  box-sizing: border-box;
  padding: 16px 21px;
`;

const Contents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 16px;
  align-self: stretch;
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
  color: rgba(243, 243, 243, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Inter", sans-serif;
  font-weight: 400;
  line-height: 160%;
  text-align: left;
`;

const TabFeaturedMenu_0001 = styled.div`
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
  border-radius: 4px;
  width: 332px;
  height: 66px;
  background-color: rgba(48, 50, 52, 1);
  box-sizing: border-box;
  padding: 16px 21px;
`;

const Contents_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 16px;
  align-self: stretch;
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
  font-family: "Inter", sans-serif;
  font-weight: 400;
  line-height: 160%;
  text-align: left;
`;

const TabFeaturedMenu_0002 = styled.em`
  color: red;
`;

const TabFeaturedMenu_0003 = styled.em`
  color: red;
`;

const TabFeaturedMenu_0004 = styled.em`
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

const Demo = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
`;

const ActionArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 394px;
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
  width: 322px;
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

const Contents_0002 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  width: 322px;
  height: 29px;
  box-sizing: border-box;
`;

const Label = styled.span`
  color: rgba(125, 125, 125, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Inter", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const IconsMdiKeyboardArrowRight = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;
