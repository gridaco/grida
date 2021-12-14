import React from "react";
import styled from "@emotion/styled";
import { HomeLogo } from "icons/home-logo";
import { AnimatedLineProgressBar } from "@frogress/line";
import { colors } from "theme";

export function EditorSkeleton({ percent = 0 }: { percent?: number }) {
  return (
    <SkeletonWrap>
      <LoadingIndicatorContainer>
        <HomeLogo />
        <AnimatedLineProgressBar
          containerColor="#838383"
          progressColor="#fff"
          defaultValue={0}
          percent={percent * 100}
        />
      </LoadingIndicatorContainer>
      {/* <Body>
        <SidebarMock>
          <ListMock>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <MockItem1 key={i.toString()}>
                <BaseHierarchyItem>
                  <Frame55>
                    <Frame52></Frame52>
                    <Frame324></Frame324>
                  </Frame55>
                </BaseHierarchyItem>
              </MockItem1>
            ))}
          </ListMock>
        </SidebarMock>
        <CanvasMock></CanvasMock>
        <CodeEditorMock></CodeEditorMock>
      </Body> */}
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
