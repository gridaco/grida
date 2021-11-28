import styled from "@emotion/styled";
import React from "react";

import { WindowHandle, StatusBar, Panel } from "components/mock-vscode";
import { k } from "sections";

import { HeadingGradient } from "./styles/heading";

export default function DesignOnceRunAnywhere320SizeXs() {
  return (
    <Contents>
      <Heading1>{k.contents.heading2_design_once_run_anywhere}</Heading1>
      <VscodeDemo>
        <WindowHandle />
        <Container>
          {/* <Sidebar>
              <IPhone11ProX1></IPhone11ProX1>
            </Sidebar> */}
          <Panel />
        </Container>
        <StatusBar></StatusBar>
      </VscodeDemo>
    </Contents>
  );
}

const Contents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  align-self: stretch;
  gap: 55px;
  box-sizing: border-box;
  padding: 64px 20px 24px;
`;

const Heading1 = styled.span`
  text-overflow: ellipsis;
  font-size: 32px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  letter-spacing: -1px;
  ${HeadingGradient}
  text-align: center;
`;

const VscodeDemo = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  box-shadow: 0px 12px 32px rgba(0, 0, 0, 0.48);
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
