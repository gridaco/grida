import { css, Global } from "@emotion/react";
import React from "react";
import { RecoilRoot } from "recoil";
import { Home } from "../home/home";

export function AppRoot() {
  return (
    <>
      <Global
        styles={css`
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
      <RecoilRoot>
        <Home />
      </RecoilRoot>
    </>
  );
}
