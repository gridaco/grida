import React from "react";
import styled from "@emotion/styled";
import { HomeLogo } from "icons/home-logo";
import { AnimatedLineProgressBar } from "@frogress/line";

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

const HomeLogo42 = styled.div`
  width: 42px;
  height: 42px;
  position: relative;
`;

const LogoShapeOnlyArtwork = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Loading = styled.div`
  width: 221px;
  height: 6px;
  overflow: hidden;
  background-color: rgba(131, 131, 131, 1);
  position: relative;
`;

const Rectangle892 = styled.div`
  width: 120px;
  height: 6px;
  background-color: rgba(255, 255, 255, 1);
  position: absolute;
  left: 0px;
  top: 0px;
`;

const Body = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  box-sizing: border-box;
  position: absolute;
`;

const SidebarMock = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 10px;
  width: 200px;
  box-sizing: border-box;
  padding: 100px 10px 10px;
`;

const ListMock = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 180px;
  height: 330px;
  box-sizing: border-box;
`;

const MockItem1 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
  opacity: 0.2;
`;

const BaseHierarchyItem = styled.div`
  height: 30px;
  border-radius: 6px;
  position: relative;
  align-self: stretch;
`;

const Frame55 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  position: absolute;
  left: 8px;
  top: calc((calc((50% + 0px)) - 7px));
  width: 150px;
  height: 14px;
`;

const Frame52 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 5px;
  width: 29px;
  height: 12px;
  box-sizing: border-box;
`;

const LayerTokensExpandStateIndicator = styled.img`
  width: 12px;
  height: 12px;
  object-fit: cover;
`;

const NodeIconsPlaceholder = styled.img`
  width: 12px;
  height: 12px;
  object-fit: cover;
`;

const Frame324 = styled.div`
  width: 117px;
  height: 14px;
  background-color: rgba(255, 255, 255, 1);
  border-radius: 4px;
`;

const CanvasMock = styled.div`
  flex: 1;
  align-self: stretch;
`;

const CodeEditorMock = styled.div`
  flex: 1;
  align-self: stretch;
  background-color: rgba(30, 30, 30, 1);
`;
