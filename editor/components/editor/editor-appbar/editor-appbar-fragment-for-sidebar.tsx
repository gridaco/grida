import React from "react";
import styled from "@emotion/styled";

export function AppbarFragmentForSidebar() {
  return (
    <RootWrapperAppbarFragmentForSidebar>
      <div
        style={{
          width: 24,
          height: 24,
        }}
      ></div>
      {/* <IconsMdiMenu
        // TODO: replace resource
        src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/333b/8550/4bdd6a7ceffe5b23b37bc68c1fb7a4ab"
        alt="image of IconsMdiMenu"
      ></IconsMdiMenu> */}
    </RootWrapperAppbarFragmentForSidebar>
  );
}

const RootWrapperAppbarFragmentForSidebar = styled.div`
  z-index: 10;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  width: 200px;
  align-self: stretch;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
  padding: 14px 16px;
`;

const IconsMdiMenu = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;
