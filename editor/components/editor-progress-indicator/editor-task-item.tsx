import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import LinearProgress from "@mui/material/LinearProgress";

export function EditorTaskItem({
  label,
  description,
  progress,
  createdAt,
}: {
  label: string;
  description?: string;
  progress: number | null;
  createdAt?: Date;
}) {
  return (
    <RootWrapperProgressingItemReadonly>
      <TitleAndValueContainer>
        <ThisLabel>{label}</ThisLabel>
        <ColoredLinearProgress value={progress} />
      </TitleAndValueContainer>
      <FooterContainer>
        <ThisDescription>{description}</ThisDescription>
        {createdAt && <EllapsedTime from={createdAt} />}
      </FooterContainer>
    </RootWrapperProgressingItemReadonly>
  );
}

function EllapsedTime({ from }: { from: Date }) {
  const [time, settime] = useState(new Date().getTime() - from.getTime());

  useEffect(() => {
    const interval = setInterval(() => {
      settime(new Date().getTime() - from.getTime());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const formatted = formatTime(time);

  return <EllapsedTimeLabel>{formatted}</EllapsedTimeLabel>;
}

/**
 * 00:00 or 00:00:00
 *
 * @examples
 * - 00:00
 * - 00:01
 * - 00:50
 * - 01:01
 * - 59:59
 * - 01:00:00
 * @param time
 */
function formatTime(time: number) {
  const seconds = Math.floor((time / 1000) % 60);
  const minutes = Math.floor((time / (1000 * 60)) % 60);
  const hours = Math.floor((time / (1000 * 60 * 60)) % 24);

  const s = seconds < 10 ? "0" + seconds : seconds;
  const m = minutes < 10 ? "0" + minutes : minutes;
  const h = hours < 10 ? "0" + hours : hours;

  if (hours > 0) {
    return h + ":" + m + ":" + s;
  } else {
    return m + ":" + s;
  }
}

const RootWrapperProgressingItemReadonly = styled.div`
  cursor: default;
  padding: 20px;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: flex-start;
  flex: none;
  gap: 4px;
  border-radius: 8px;
  box-sizing: border-box;
  background: transparent;
  &:hover {
    background: rgba(0, 0, 0, 0.4);
  }

  transition: all 0.1s ease-in-out;
`;

const TitleAndValueContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const ThisLabel = styled.span`
  color: white;
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  width: 80px;
`;

const ColoredLinearProgress = styled(LinearProgress)`
  height: 4px;
  width: 203px;
  border-radius: 7px;
  background-color: rgb(37, 98, 255);
`;

const FooterContainer = styled.footer`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 0px;
  margin: 0px;
  align-self: stretch;
`;

const ThisDescription = styled.span`
  color: rgba(255, 255, 255, 0.5);
  text-overflow: ellipsis;
  font-size: 10px;
  font-weight: 400;
  text-align: left;
  flex: 1;
  flex-shrink: 0;
`;

const EllapsedTimeLabel = styled.label`
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
`;
