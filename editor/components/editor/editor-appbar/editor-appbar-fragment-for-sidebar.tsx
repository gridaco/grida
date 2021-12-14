import React from "react";
import styled from "@emotion/styled";
import { ArrowBack } from "@material-ui/icons";
import { useRouter } from "next/router";
import { colors } from "theme";

export function AppbarFragmentForSidebar() {
  const router = useRouter();

  return (
    <RootWrapperAppbarFragmentForSidebar>
      <ArrowBack
        style={{
          fontSize: "20px",
          fill: "white",
        }}
        onClick={() => {
          router.push("/");
        }}
      />
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
  background-color: ${colors.color_editor_bg_on_dark};
  box-sizing: border-box;
  padding: 14px 16px;
`;

const IconsMdiMenu = styled.img`
  width: 24px;
  height: 24px;
  object-fit: cover;
`;
