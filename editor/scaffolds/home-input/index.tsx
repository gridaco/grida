import React, { useState } from "react";
import styled from "@emotion/styled";
import {
  HomeInputAppbar,
  HomePrimaryInputNextButton,
} from "components/home-input";
import { HomeLogo } from "icons/home-logo";
import { useAuthState } from "hooks/use-auth-state";
import { analyze, parseFileAndNodeId } from "@design-sdk/figma-url";
import { useRouter } from "next/router";
import { colors } from "theme";

export function HomeInput() {
  const router = useRouter();
  const authstate = useAuthState();
  const show_signin_button = authstate !== "signedin";
  const [input, setInput] = useState<string>(null);
  const valid = isValidInput(input);

  const onSubmit = () => {
    if (valid) {
      const nodeconfig = parseFileAndNodeId(input);
      if (nodeconfig) {
        if (nodeconfig.node) {
          router.push(
            "/files/[key]/[node]",
            `/files/${nodeconfig.file}/${nodeconfig.node}`
          );
        } else {
          router.push("/files/[key]", `/files/${nodeconfig.file}`);
        }
      }
    }
  };

  return (
    <RootWrapper>
      <HomeInputAppbar show_signin={show_signin_button} />
      <Body>
        <HomeLogo />
        <FormWrapper>
          <HomePrimaryInputForm>
            <BaseHomePrimaryInputFormHtmlTagInput>
              <Placeholder
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSubmit();
                  }
                }}
                onChange={(e) => setInput(e.target.value)}
                placeholder={"Type your Figma design url"}
              />
              <HomePrimaryInputNextButton
                onClick={onSubmit}
                disabled={!valid}
              />
            </BaseHomePrimaryInputFormHtmlTagInput>
          </HomePrimaryInputForm>
        </FormWrapper>
      </Body>
    </RootWrapper>
  );
}

const isValidInput = (input) => {
  if (!input) return false;
  try {
    const _ = analyze(input);
    switch (_) {
      case "empty":
        return false;
      case "embed":
      case "file":
      case "fileid":
      case "maybe_fileid":
      case "maybe_nodeid":
      case "node":
      case "nodeid":
        return true;
      default:
        return false;
    }
  } catch (e) {
    return false;
  }
};

const RootWrapper = styled.div`
  overflow: hidden;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 0;
  min-height: 100vh;
  background-color: ${colors.color_editor_bg_on_dark};
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
