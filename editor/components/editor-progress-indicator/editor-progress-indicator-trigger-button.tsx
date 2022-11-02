import React from "react";
import styled from "@emotion/styled";
import { LinearProgress } from "@mui/material";
import { DownloadIcon } from "@radix-ui/react-icons";
export function EditorProgressIndicatorButton({
  isBusy = false,
}: {
  isBusy?: boolean;
}) {
  return (
    <Container>
      <DownloadIcon color="#787878" width={16} height={14} />
      {isBusy && <IndicatorLine />}
    </Container>
  );
}

function IndicatorLine() {
  return (
    <IndicatorLineContainer>
      <ColoredLinearProgress />
    </IndicatorLineContainer>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 2px;
  box-sizing: border-box;
`;

const IndicatorLineContainer = styled.div`
  width: 20px;
  height: 4px;
  background-color: rgb(37, 98, 255);
  overflow: hidden;
  border-radius: 7px;
`;

const ColoredLinearProgress = styled(LinearProgress)`
  background-color: rgb(37, 98, 255);
`;
