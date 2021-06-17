import { css, Global } from "@emotion/react";
import React from "react";
import { RecoilRoot } from "recoil";
import { Scaffold } from "../scaffold/scaffold";

const GlobalStyles = () => (
  <Global
    styles={css`
      body {
        margin: 0;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6,
      span {
        font-family: Arial, Helvetica, sans-serif;
      }
    `}
  />
);

export function AppRoot(props: {
  mode: "browser" | "desktop";
  controlDoubleClick: () => void;
}) {
  return (
    <>
      <GlobalStyles />
      <RecoilRoot>
        <Scaffold
          mode={props.mode}
          controlDoubleClick={props.controlDoubleClick}
        />
      </RecoilRoot>
    </>
  );
}
