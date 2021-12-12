import React from "react";
import styled from "@emotion/styled";

export function AppbarFragmentForCodeEditor() {
  return (
    <RootWrapperAppbarFragmentForCodeEditor>
      <Frame354>
        <Flutter>Flutter</Flutter>
        <IconsAntdSettingOutlined
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/4056/6ff2/8d18f474998d7ea1972ca5fe08258dd7"
          alt="icon"
        ></IconsAntdSettingOutlined>
      </Frame354>
      <AppbarActions>
        <AppbarIconButton
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/acff/b783/96b0feffa7116a485371002a54621c73"
          alt="icon"
        ></AppbarIconButton>
        <AppbarIconButton_0001
          src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/40e6/2dd0/0874244c17bfefb7d2125d3e55860428"
          alt="icon"
        ></AppbarIconButton_0001>
      </AppbarActions>
    </RootWrapperAppbarFragmentForCodeEditor>
  );
}

const RootWrapperAppbarFragmentForCodeEditor = styled.div`
  z-index: 10;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  background-color: rgba(30, 30, 30, 1);
  box-sizing: border-box;
  padding-bottom: 14px;
  padding-top: 14px;
  padding-left: 12px;
  padding-right: 20px;
`;

const Frame354 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 4px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Flutter = styled.span`
  color: rgba(124, 124, 124, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const IconsAntdSettingOutlined = styled.img`
  width: 16px;
  height: 16px;
  object-fit: cover;
`;

const AppbarActions = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 14px;
  width: 62px;
  height: 24px;
  box-sizing: border-box;
`;

const AppbarIconButton = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;

const AppbarIconButton_0001 = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;
