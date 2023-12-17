import React from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";

export function HomeInputAppbar({ show_signin }: { show_signin: boolean }) {
  const router = useRouter();

  return (
    <RootWrapperHomeInputAppbar>
      <Menu target="_blank" href="https://github.com/gridaco/code">
        <MenuTetx>Github</MenuTetx>
      </Menu>
      <Menu target="_blank" href="https://grida.co">
        <MenuTetx>Grida.co</MenuTetx>
      </Menu>
      <Menu href="/docs">
        <MenuTetx>Docs</MenuTetx>
      </Menu>
      {show_signin && (
        <SigninButton
          onClick={() => {
            router.push(
              "https://accounts.grida.co/signin?redirect_uri=" +
                encodeURIComponent(router.asPath)
            );
          }}
        >
          <SignIn>Sign in</SignIn>
        </SigninButton>
      )}
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

const MenuTetx = styled.span`
  color: rgba(147, 147, 147, 1);
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const Menu = styled.a`
  display: flex;
  text-decoration: none;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  border-radius: 4px;
  height: 40px;
  box-sizing: border-box;
  padding: 10px 10px;
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
