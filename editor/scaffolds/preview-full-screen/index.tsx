import React, { useEffect, useState } from "react";
import { useEditorState } from "core/states";
import styled from "@emotion/styled";
import { useWindowSize } from "hooks";
import { CrossCircledIcon } from "@radix-ui/react-icons";
import ClientOnly from "components/client-only";
import { VanillaDedicatedPreviewRenderer } from "components/app-runner";

export function FullScreenPreview({ onClose }: { onClose: () => void }) {
  const [state] = useEditorState();
  const windowsize = useWindowSize();

  const {
    fallbackSource,
    loader,
    source,
    initialSize,
    isBuilding,
    widgetKey: key,
    componentName,
  } = state.currentPreview || {
    isBuilding: true,
  };

  useEffect(() => {
    // logger
    console.log(
      "rendering fullscreen preview with existing preview data..",
      state.currentPreview
    );
  }, []);

  //
  return (
    <RootWrapperFullScreenRunnerViewLayout>
      <FullscreenPreviewAppbar>
        <AppbarControlSizeInputs>
          <StaticSizeInput value={windowsize.width ?? 0} suffix={"W"} />
          <StaticSizeInput value={windowsize.height ?? 0} suffix={"H"} />
        </AppbarControlSizeInputs>
        <AppbarActionsSegment>
          <CloseButton onClick={onClose} />
        </AppbarActionsSegment>
      </FullscreenPreviewAppbar>
      <Body>
        {isBuilding ? (
          <>loading</>
        ) : (
          <VanillaDedicatedPreviewRenderer {...state.currentPreview} />
        )}
      </Body>
    </RootWrapperFullScreenRunnerViewLayout>
  );
}

const StaticSizeInput = ({
  value,
  suffix,
}: {
  value: number;
  suffix: string;
}) => {
  return (
    <WidthInput>
      <Value>{value}</Value>
      <ValueSuffixText>{suffix}</ValueSuffixText>
    </WidthInput>
  );
};

const CloseButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <CloseButtonBase onClick={onClick}>
      <ClientOnly>
        <CrossCircledIcon color="white" />
      </ClientOnly>
    </CloseButtonBase>
  );
};

const RootWrapperFullScreenRunnerViewLayout = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
`;

const FullscreenPreviewAppbar = styled.div`
  height: 50px;
  overflow: hidden;
  background-color: rgba(17, 17, 17, 1);
  position: relative;
  align-self: stretch;
`;

const AppbarControlSizeInputs = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  width: 170px;
  box-sizing: border-box;
  position: absolute;
  left: calc((calc((50% + 0px)) - 85px));
  top: calc((calc((50% + 0px)) - 12px));
`;

const WidthInput = styled.div`
  width: 68px;
  height: 24px;
  position: relative;
`;

const Value = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 11px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: left;
  position: absolute;
  left: 8px;
  top: 5px;
`;

const ValueSuffixText = styled.span`
  color: rgba(182, 182, 182, 1);
  text-overflow: ellipsis;
  font-size: 11px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: left;
  position: absolute;
  left: 54px;
  top: 6px;
`;

const AppbarActionsSegment = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 21px;
  box-sizing: border-box;
  position: absolute;
  top: calc((calc((50% + 0px)) - 13px));
  right: 24px;
`;

const CloseButtonBase = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  box-shadow: 0px 4px 12px 0px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  width: 34px;
  height: 26px;
  background-color: rgba(43, 43, 43, 1);
  box-sizing: border-box;
`;

const IconsMdiClose = styled.img`
  width: 20px;
  height: 20px;
  object-fit: cover;
`;

const Body = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: 1;
  height: 100%;
  align-self: stretch;
  box-sizing: border-box;
`;
