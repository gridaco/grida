import styled from "@emotion/styled";
import React from "react";

import ActionItem from "components/action-item";
import { Tabs } from "components/landingpage/tab-featured-menu";
import { k } from "sections";

import { breakpoints } from "../_breakpoints";
import { DemoVSCode } from "./components";
import { TabsList } from "./tabs";

export function SectionBornToBeHeadlessScaffold() {
  return (
    <Wrapper>
      <HeaderArea>
        <Heading>{k.contents.heading2_born_to_be_headless}</Heading>
        <Desc>{k.contents.p_born_to_be_headless_description}</Desc>
      </HeaderArea>
      <DemoArea>
        <SwitchContainer>
          <Tabs theme="dark" tabs={TabsList} initialSelection="vscode" />
        </SwitchContainer>
        <DemoContentArea>
          <Demo>
            <DemoVSCode />
          </Demo>
          <ActionArea>
            <ActionItem
              theme="dark"
              target="_blank"
              label="Get the VSCode Extension?"
              href={"https://grida.co/vscode"}
            />
          </ActionArea>
        </DemoContentArea>
      </DemoArea>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 86px;
  background-color: rgba(48, 50, 52, 1);
  box-sizing: border-box;
  padding: 100px 0px 140px;

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    gap: 86px;
    padding: 100px 0px 140px;
  }
  @media ${breakpoints.md} {
    gap: 86px;
    padding: 100px 0px 140px;
  }
  @media ${breakpoints.sm} {
    align-items: center;
    gap: 86px;
    padding: 100px 0px 140px;
  }
  @media ${breakpoints.xs} {
    align-items: center;
    gap: 86px;
    padding: 100px 0px 140px;
  }
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
  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 26px;
    align-self: stretch;
  }
  @media ${breakpoints.md} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 26px;
    align-self: stretch;
  }
  @media ${breakpoints.sm} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 26px;
    align-self: stretch;
    padding: 0px 24px;
  }
  @media ${breakpoints.xs} {
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 26px;
    align-self: stretch;
    box-sizing: border-box;
    padding: 0px 24px;
  }
`;

const Heading = styled.span`
  color: rgba(222, 222, 222, 1);
  text-overflow: ellipsis;
  font-size: 64px;
  font-family: "Inter", sans-serif;
  font-weight: 700;
  line-height: 98%;
  text-align: center;

  @media ${breakpoints.xl} {
    /* width: 518px; */
  }
  @media ${breakpoints.lg} {
    font-size: 64px;
    font-weight: 700;
    line-height: 98%;
    text-align: center;
    width: 518px;
  }
  @media ${breakpoints.md} {
    font-size: 64px;
    font-weight: 700;
    line-height: 98%;
    text-align: center;
    width: 518px;
  }
  @media ${breakpoints.sm} {
    font-size: 56px;
    font-weight: 700;
    line-height: 98%;
    text-align: center;
    align-self: stretch;
  }
  @media ${breakpoints.xs} {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -1px;
    line-height: 98%;
    text-align: center;
    align-self: stretch;
  }
`;

const Desc = styled.span`
  color: rgba(161, 162, 162, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Inter", sans-serif;
  font-weight: 500;
  line-height: 160%;
  text-align: center;

  @media ${breakpoints.xl} {
    /* width: 780px; */
  }
  @media ${breakpoints.lg} {
    font-size: 24px;
    line-height: 160%;
    text-align: center;
    width: 780px;
  }
  @media ${breakpoints.md} {
    font-size: 24px;
    line-height: 160%;
    text-align: center;
    width: 780px;
  }
  @media ${breakpoints.sm} {
    font-size: 22px;
    line-height: 160%;
    text-align: center;
    align-self: stretch;
  }
  @media ${breakpoints.xs} {
    font-size: 18px;
    text-align: center;
    align-self: stretch;
  }
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

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    justify-content: center;
    flex-direction: row;
    align-items: start;
    flex: 1;
    gap: 80px;
    align-self: stretch;
    box-sizing: border-box;
    padding-left: 80px;
  }
  @media ${breakpoints.md} {
    justify-content: center;
    flex-direction: row;
    align-items: start;
    flex: 1;
    gap: 80px;
    align-self: stretch;
    box-sizing: border-box;
    padding-left: 80px;
  }
  @media ${breakpoints.sm} {
    justify-content: center;
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 80px;
    align-self: stretch;
    box-sizing: border-box;
    padding: 0px 80px;
  }
  @media ${breakpoints.xs} {
    justify-content: center;
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 80px;
    align-self: stretch;
    box-sizing: border-box;
    padding: 0px 20px;
  }
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

  @media ${breakpoints.xl} {
  }
  @media ${breakpoints.lg} {
    display: flex;
    justify-content: flex-start;
    flex-direction: row;
    align-items: start;
    flex: none;
    gap: 10px;
    width: 352px;
    height: 486px;
    padding: 24px 10px;
  }
  @media ${breakpoints.md} {
    display: flex;
    justify-content: flex-start;
    flex-direction: row;
    align-items: start;
    flex: none;
    gap: 10px;
    width: 352px;
    height: 486px;
    padding: 24px 10px;
  }
  @media ${breakpoints.sm} {
    justify-content: flex-start;
    flex-direction: row;
    align-items: start;
    flex: none;
    gap: 10px;
    height: 66px;
  }
  @media ${breakpoints.xs} {
    display: flex;
    justify-content: start;
    flex-direction: row;
    align-items: flex-start;
    flex: none;
    width: 100%;
    gap: 10px;
    height: 66px;
  }
`;

const DemoContentArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 10px;
  height: 626px;
  box-sizing: border-box;

  @media ${breakpoints.xl} {
    width: 928px;
  }
  @media ${breakpoints.lg} {
    flex-direction: column;
    align-items: start;
    flex: none;
    gap: 10px;
    width: 768px;
    height: 626px;
  }
  @media ${breakpoints.md} {
    flex-direction: column;
    align-items: start;
    flex: none;
    gap: 10px;
    width: 512px;
    height: 626px;
  }
  @media ${breakpoints.sm} {
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 10px;
    align-self: stretch;
  }
  @media ${breakpoints.xs} {
    flex-direction: column;
    align-items: start;
    flex: 1;
    gap: 10px;
    align-self: stretch;
  }
`;

const Demo = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  /* flex: 1; */
  /* gap: 10px; */
  align-self: stretch;
  box-sizing: border-box;
  height: 567px;
  @media ${breakpoints.xl} {
    width: 1100px;
  }
  @media ${breakpoints.lg} {
    width: 1100px;
  }
  @media ${breakpoints.md} {
    width: 1100px;
  }
  @media ${breakpoints.sm} {
  }
  @media ${breakpoints.xs} {
  }
`;

const ActionArea = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 10px 36px;
`;
