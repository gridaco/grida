import React from "react";
import styled from "@emotion/styled";
import { HomeLogo } from "icons/home-logo";
import { withStyles } from "@material-ui/core/styles";
import Box from "@material-ui/core/Box";
import LinearProgress from "@material-ui/core/LinearProgress";
import ClientOnly from "components/client-only";

export function EditorSkeleton({
  percent = 0,
}: {
  /**
   * loading progress to display on progress bar
   */
  percent?: number;
}) {
  return (
    <SkeletonWrap>
      <LoadingIndicatorContainer>
        <LogoAndLoading>
          <HomeLogo />
          <ClientOnly>
            <ColoredLinearProgress value={percent} />
          </ClientOnly>
        </LogoAndLoading>
        <TipsContainer />
      </LoadingIndicatorContainer>
    </SkeletonWrap>
  );
}

const SkeletonWrap = styled.div`
  width: 100vw;
  height: 100vh;
  z-index: 99;
  position: absolute;
  background-color: #0000004f;
`;

const LoadingIndicatorContainer = styled.div`
  z-index: 100;
  user-select: none;
  cursor: default;
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  box-sizing: border-box;
  position: absolute;
  margin: auto;
  /* pos */
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -80px;
  margin-left: -110px;
  width: 220px;
`;

const LogoAndLoading = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 40px;
  width: 100%;
  align-self: stretch;
  box-sizing: border-box;
`;

const styles = (props) => ({
  colorPrimary: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  barColorPrimary: {
    backgroundColor: "#fff",
  },
});

const ColoredLinearProgress = withStyles(styles)(function (props: {
  value?: number;
}) {
  //@ts-ignore
  const { classes } = props;
  return (
    <Box sx={{ width: "100%" }}>
      <LinearProgress
        {...props}
        classes={{
          colorPrimary: classes.colorPrimary,
          barColorPrimary: classes.barColorPrimary,
        }}
      />
    </Box>
  );
});

export function TipsContainer() {
  return (
    <RootWrapperTipsContainer>
      <Tip>First Loading might take a while depending on your file size.</Tip>
    </RootWrapperTipsContainer>
  );
}

const RootWrapperTipsContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 0px 8px;
`;

const Tip = styled.span`
  color: rgba(255, 255, 255, 0.33);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: center;
  width: 205px;
`;
