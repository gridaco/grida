import React from "react";
import styled from "@emotion/styled";
import { ArrowBack } from "@material-ui/icons";
import { useRouter } from "next/router";
import { colors } from "theme";
import ClientOnly from "components/client-only";

export function AppbarFragmentForSidebar() {
  const router = useRouter();

  return (
    <RootWrapperAppbarFragmentForSidebar>
      <ClientOnly>
        <ArrowBack
          style={{
            fontSize: "20px",
            fill: "white",
          }}
          onClick={() => {
            router.push("/");
          }}
        />
      </ClientOnly>
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
