import React from "react";
import styled from "@emotion/styled";

export function AppbarFragmentForCanvas() {
  return (
    <RootWrapperAppbarFragmentForCanvas>
      <MusicAppHomeScreen>@music-app / home-screen</MusicAppHomeScreen>
    </RootWrapperAppbarFragmentForCanvas>
  );
}

const RootWrapperAppbarFragmentForCanvas = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
  padding: 10px 24px;
`;

const MusicAppHomeScreen = styled.span`
  text-overflow: ellipsis;
  font-size: 14px;
  color: grey;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;
