import styled from "@emotion/styled";
import React from "react";

import {
  ActivityBar,
  WindowHandle,
  StatusBar,
  Panel,
} from "components/mock-vscode";

import { breakpoints } from "../_breakpoints";
import MusicHome from "../demo-app";
import { BackgroundGradient } from "./styles/background";
import { HeadingGradient } from "./styles/heading";
import { useTranslation } from "next-i18next";

export default function DesignOnceRunAnywhereScaffold() {
  const { t } = useTranslation("page-index", {
    keyPrefix: "section/run-anywhere",
  });

  return (
    <RootWrapper>
      <Contents>
        <Spacer></Spacer>
        <Heading1>{t("heading")}</Heading1>
        {/* <p>Convert your figma design to React, Flutter, TS & HTML/CSS code.</p> */}
        <VscodeDemo>
          <WindowHandle />
          <DemoContents />
          <StatusBar></StatusBar>
        </VscodeDemo>
      </Contents>
    </RootWrapper>
  );
}

function DemoContents() {
  return (
    <Container>
      <ResponsiveActivityBar>
        <ActivityBar></ActivityBar>
      </ResponsiveActivityBar>
      <Sidebar>
        <IPhone11ProX1>
          <MusicHome />
        </IPhone11ProX1>
      </Sidebar>
      <Panel />
    </Container>
  );
}

const RootWrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 0;
  ${BackgroundGradient}
  box-sizing: border-box;
  overflow: hidden;

  height: 1100px;
  @media ${breakpoints.xs} {
    height: 800px;
  }
`;

const Contents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 68px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 0px 0px 48px;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 68px;
    align-self: stretch;
    padding: 0px 48px 48px;
  }
  @media ${breakpoints.md} {
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 68px;
    align-self: stretch;
    padding: 0px 48px 48px;
  }
  @media ${breakpoints.sm} {
    flex-direction: column;
    align-items: center;
    flex: none;
    gap: 83px;
    height: 871px;
    align-self: stretch;
    padding: 0px 0px 48px;
  }
  @media ${breakpoints.xs} {
    flex-direction: column;
    align-items: center;
    flex: none;
    align-self: stretch;
    gap: 55px;
    padding: 64px 20px 24px;
  }
`;

const Spacer = styled.div`
  width: 1px;
  height: 1px;
`;

const Heading1 = styled.h2`
  margin-block: 0px;
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Inter", sans-serif;
  font-weight: 700;
  ${HeadingGradient}
  text-align: center;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    font-size: 64px;
    text-align: center;
  }
  @media ${breakpoints.md} {
    font-size: 64px;
    text-align: center;
  }
  @media ${breakpoints.sm} {
    font-size: 64px;
    font-weight: 700;
    width: 728px;
  }
  @media ${breakpoints.xs} {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -1px;
  }
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
  height: 710px;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
  /* max-width: 1238px; */

  @media ${breakpoints.xl} {
    width: 1238px;
  }
  @media ${breakpoints.lg} {
    flex: 1;
    gap: 0;
    align-self: stretch;
  }
  @media ${breakpoints.md} {
    flex: 1;
    gap: 0;
    align-self: stretch;
  }
  @media ${breakpoints.sm} {
    flex-direction: column;
    align-items: start;
    flex: none;
    align-self: stretch;
    gap: 0;
    margin-left: 40px;
    margin-right: 40px;
    /* width: 728px; */
    height: 530px;
  }
  @media ${breakpoints.xs} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    /* flex: 1; */
    gap: 0;
    border-radius: 10px;
    align-self: stretch;
    height: 490px;
  }
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

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
  }
  @media ${breakpoints.md} {
  }
  @media ${breakpoints.sm} {
    /* width: 300px; */
  }
  @media ${breakpoints.xs} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 0;
    align-self: stretch;
  }
`;

const Sidebar = styled.div`
  width: 467px;
  overflow: hidden;
  background-color: rgba(37, 37, 38, 1);
  position: relative;
  align-self: stretch;
  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
  }
  @media ${breakpoints.md} {
  }
  @media ${breakpoints.sm} {
    width: 300px;
  }
  @media ${breakpoints.xs} {
    display: none;
  }
`;

const IPhone11ProX1 = styled.div`
  width: 375px;
  height: 812px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border: solid 1px rgba(235, 235, 235, 1);
  position: absolute;
  box-shadow: 0px 4px 64px 8px rgba(146, 146, 146, 0.12);
  left: 45px;
  top: 42px;

  @media ${breakpoints.xs} {
    display: none;
  }
`;

const ResponsiveActivityBar = styled.div`
  @media ${breakpoints.xs} {
    display: none;
  }
`;
