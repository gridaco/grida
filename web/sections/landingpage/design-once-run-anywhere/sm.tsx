import styled from "@emotion/styled";
import React from "react";

import {
  ActivityBar,
  WindowHandle,
  StatusBar,
  Panel,
} from "components/mock-vscode";

import { BackgroundGradient } from "./styles/background";
import { HeadingGradient } from "./styles/heading";

export default function DesignOnceRunAnywhere768SizeSm() {
  return (
    <RootWrapperDesignOnceRunAnywhere768SizeSm>
      <Contents>
        <Spacer></Spacer>
        <Heading1>Design once, Run anywhere.</Heading1>
        <VscodeDemo>
          <WindowHandle />
          <Container>
            <ActivityBar></ActivityBar>
            <Sidebar>
              <IPhone11ProX1></IPhone11ProX1>
            </Sidebar>
            <Panel />
          </Container>
          <StatusBar></StatusBar>
        </VscodeDemo>
      </Contents>
    </RootWrapperDesignOnceRunAnywhere768SizeSm>
  );
}

const RootWrapperDesignOnceRunAnywhere768SizeSm = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: start;
  gap: 10px;
  min-height: 100vh;
  ${BackgroundGradient}
  box-sizing: border-box;
  overflow: hidden;
`;

const Contents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 83px;
  width: 768px;
  height: 871px;
  box-sizing: border-box;
  padding: 0px 0px 48px;
`;

const Spacer = styled.div`
  width: 1px;
  height: 1px;
`;

const Heading1 = styled.span`
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  ${HeadingGradient}
  text-align: center;
  width: 728px;
`;

const VscodeDemo = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  box-shadow: 0px 12px 32px 2px rgba(0, 0, 0, 0.48);
  border: solid 1px rgba(69, 69, 69, 1);
  border-radius: 10px;
  width: 728px;
  height: 530px;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
`;

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const Sidebar = styled.div`
  width: 300px;
  overflow: hidden;
  background-color: rgba(37, 37, 38, 1);
  position: relative;
  align-self: stretch;
`;

const IPhone11ProX1 = styled.div`
  width: 231px;
  height: 501px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border: solid 1px rgba(235, 235, 235, 1);
  position: absolute;
  box-shadow: 0px 2px 39px 5px rgba(146, 146, 146, 0.12);
  left: 34px;
  top: 42px;
`;
