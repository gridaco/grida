import React from "react";
import styled from "@emotion/styled";
import { CircularProgress } from "@mui/material";
import { DownloadIcon } from "@radix-ui/react-icons";
export function EditorProgressIndicatorButton({
  isBusy = false,
}: {
  isBusy?: boolean;
}) {
  return (
    <Container>
      {isBusy && <Indicator />}
      <DownloadIcon color="#787878" width={16} height={16} />
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
`;

function Indicator() {
  return (
    <IndicatorLineContainer>
      <ColoredProgress size="100%" />
    </IndicatorLineContainer>
  );
}

const IndicatorLineContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
`;

const ColoredProgress = styled(CircularProgress)`
  color: rgb(37, 98, 255);
`;
