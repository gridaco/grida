import styled from "@emotion/styled";
import React from "react";

export function TabsHeader() {
  return (
    <RootWrapperTabsHeader>
      <Tabs>
        <VscodeTab>
          <BaseVscodeTab>
            <Frame565>
              <PlatformIconsReactDefault
                src="grida://assets-reservation/images/I7298:73495;7257:69631;7215:42592"
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
                  src="grida://assets-reservation/images/I7298:73496;7257:69633;7215:42592;4787:25176"
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
                  src="grida://assets-reservation/images/I7298:73497;7257:69633;7215:42592;4787:25189"
                  alt="image of Image76"
                ></Image76>
              </PlatformIconsHtmlGrey>
              <FileNameTxt_0002>vanilla.html</FileNameTxt_0002>
            </Frame565_0002>
          </BaseVscodeTab_0002>
        </VscodeTab_0002>
      </Tabs>
      <Toolbar>
        <Actions>
          <Actions_0001>
            <Icon></Icon>
          </Actions_0001>
        </Actions>
        <Actions_0002>
          <Actions_0003>
            <Icon_0001></Icon_0001>
          </Actions_0003>
        </Actions_0002>
      </Toolbar>
    </RootWrapperTabsHeader>
  );
}

const RootWrapperTabsHeader = styled.div`
  display: flex;
  justify-content: space-between;
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
  width: 14px;
  height: 14px;
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
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
  width: 14px;
  height: 14px;
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
`;

const FileNameTxt_0002 = styled.span`
  color: rgba(119, 119, 119, 1);
  text-overflow: ellipsis;
  font-size: 13px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 0;
  width: 64px;
  height: 36px;
  box-sizing: border-box;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 32px;
  height: 36px;
  box-sizing: border-box;
`;

const Actions_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 10px;
  width: 32px;
  height: 36px;
  box-sizing: border-box;
  padding: 10px 8px;
`;

const Icon = styled.span`
  color: rgba(204, 204, 204, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
`;

const Actions_0002 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 32px;
  height: 36px;
  box-sizing: border-box;
`;

const Actions_0003 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 10px;
  width: 32px;
  height: 36px;
  box-sizing: border-box;
  padding: 10px 8px;
`;

const Icon_0001 = styled.span`
  color: rgba(204, 204, 204, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
`;
