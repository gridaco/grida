import React from "react";
import styled from "@emotion/styled";
import {
  HomeInputAppbar,
  HomePrimaryInputNextButton,
} from "components/home-input";
import { HomeLogo } from "icons/home-logo";

export function HomeInputLayout() {
  return (
    <RootWrapper>
      <HomeInputAppbar />
      <Body>
        <HomeLogo />
        <FormWrapper>
          <HomePrimaryInputForm>
            <BaseHomePrimaryInputFormHtmlTagInput>
              <Placeholder placeholder={"Type your Figma design url"} />
              <HomePrimaryInputNextButton />
            </BaseHomePrimaryInputFormHtmlTagInput>
          </HomePrimaryInputForm>
        </FormWrapper>
      </Body>
    </RootWrapper>
  );
}

const RootWrapper = styled.div`
  overflow: hidden;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 0;
  min-height: 100vh;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
`;

const Body = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 60px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 24px 24px 40px;
`;

const FormWrapper = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 10px 10px 160px;
`;

const HomePrimaryInputForm = styled.div`
  max-width: 551px;
  width: 100%;
  height: 56px;
  position: relative;
`;

const BaseHomePrimaryInputFormHtmlTagInput = styled.div`
  background-color: rgba(60, 60, 60, 1);
  border-radius: 12px;
  position: absolute;
  box-shadow: 0px 4px 32px 2px rgba(0, 0, 0, 0.25);
  padding: 16px 16px 16px 26px;
  display: flex;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Placeholder = styled.input`
  color: white;
  ::placeholder {
    color: rgba(166, 166, 166, 1);
  }
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  background-color: transparent;
  border: none;
  outline: none;
  text-align: left;
  width: 100%;
  margin-right: 46px;
`;
