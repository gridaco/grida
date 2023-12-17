import React, { useState } from "react";
import styled from "@emotion/styled";
import { GearIcon, Cross1Icon } from "@radix-ui/react-icons";
import { IconToggleButton } from "@code-editor/ui";

type Props = {
  layout: string;
  orientation: string;
  linkType: string;
  stepPercent: number;
  setLayout: (layout: string) => void;
  setOrientation: (orientation: string) => void;
  setLinkType: (linkType: string) => void;
  setStepPercent: (percent: number) => void;
};

export default function LinkControls({
  layout,
  orientation,
  linkType,
  stepPercent,
  setLayout,
  setOrientation,
  setLinkType,
  setStepPercent,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <ControlContainer data-expanded={isExpanded}>
      <div
        className="controls"
        style={{
          display: isExpanded ? undefined : "none",
        }}
      >
        <div className="control">
          <label>layout</label>
          <select
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setLayout(e.target.value)}
            value={layout}
          >
            <option value="cartesian">cartesian</option>
            <option value="polar">polar</option>
          </select>
        </div>
        <div className="control">
          <label>orientation</label>
          <select
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setOrientation(e.target.value)}
            value={orientation}
            disabled={layout === "polar"}
          >
            <option value="vertical">vertical</option>
            <option value="horizontal">horizontal</option>
          </select>
        </div>
        <div className="control">
          <label>link</label>
          <select
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setLinkType(e.target.value)}
            value={linkType}
          >
            <option value="diagonal">diagonal</option>
            <option value="step">step</option>
            <option value="curve">curve</option>
            <option value="line">line</option>
          </select>
        </div>
        {linkType === "step" && layout !== "polar" && (
          <div className="control">
            <label>step</label>
            <input
              onClick={(e) => e.stopPropagation()}
              type="range"
              min={0}
              max={1}
              step={0.1}
              onChange={(e) => setStepPercent(Number(e.target.value))}
              value={stepPercent}
              disabled={linkType !== "step" || layout === "polar"}
            />
          </div>
        )}
      </div>
      <div style={{ marginLeft: 16 }}>
        <IconToggleButton
          on={<Cross1Icon />}
          off={<GearIcon />}
          onChange={setIsExpanded}
        />
      </div>
    </ControlContainer>
  );
}

const ControlContainer = styled.div`
  position: absolute;
  top: 16px;
  right: 16px;

  display: flex;
  padding: 16px;

  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(16px);
  font-size: 10px;
  color: white;

  &[data-expanded="false"] {
    border: none;
    background-color: transparent;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .control {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
`;
