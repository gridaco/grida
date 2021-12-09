import React from "react";
import styled from "@emotion/styled";

export function HomeInputAppbar() {
  return (
    <RootWrapperHomeInputAppbar>
      <GithubMenu>
        <Github>Github</Github>
      </GithubMenu>
      <GridacoMenu>
        <GridaCo>Grida.co</GridaCo>
      </GridacoMenu>
      <DocsMenu>
        <Docs>Docs</Docs>
      </DocsMenu>
      <SigninButton>
        <SignIn>Sign in</SignIn>
      </SigninButton>
    </RootWrapperHomeInputAppbar>
  );
}

const RootWrapperHomeInputAppbar = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 16px 40px;
`;

const GithubMenu = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 68px;
  height: 39px;
  box-sizing: border-box;
  padding: 10px 10px;
`;

const Github = styled.span`
  color: rgba(147, 147, 147, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const GridacoMenu = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 82px;
  height: 39px;
  box-sizing: border-box;
  padding: 10px 10px;
`;

const GridaCo = styled.span`
  color: rgba(147, 147, 147, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const DocsMenu = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 58px;
  height: 39px;
  box-sizing: border-box;
  padding: 10px 10px;
`;

const Docs = styled.span`
  color: rgba(147, 147, 147, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const SigninButton = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 69px;
  height: 39px;
  box-sizing: border-box;
  padding: 10px 10px;
`;

const SignIn = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;
