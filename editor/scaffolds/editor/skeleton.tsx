import React from "react";
import styled from "@emotion/styled";
import { HomeLogo } from "icons/home-logo";
import { withStyles } from "@material-ui/core/styles";
import Box from "@material-ui/core/Box";
import LinearProgress from "@material-ui/core/LinearProgress";

export function EditorSkeleton({ percent = 0 }: { percent?: number }) {
  return (
    <SkeletonWrap>
      <LoadingIndicatorContainer>
        <HomeLogo />
        <ColoredLinearProgress />
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
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 40px;
  box-sizing: border-box;
  position: absolute;
  margin: auto;
  /* pos */
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -44px;
  margin-left: -110px;
  width: 220px;
  height: 88px;
`;

const styles = (props) => ({
  colorPrimary: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  barColorPrimary: {
    backgroundColor: "#fff",
  },
});

const ColoredLinearProgress = withStyles(styles)(function (props) {
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
