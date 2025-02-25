import React from "react";
import styled from "@emotion/styled";
import { ReloadIcon } from "@radix-ui/react-icons";
import { colors } from "theme";

export function ZoomControl({
  scale,
  stepper,
  onChange,
  onReset,
  canReset,
}: {
  onChange: (scale: number) => void;
  resetControl?: boolean;
  select?: boolean;
  stepper?: boolean;
  scale: number;
  canReset?: boolean;
  onReset?: () => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const displayScale = (scale * 100).toFixed(0);
  const mincontrol = 0;
  return (
    <Wrapper>
      <Controls>
        <ControlsContainer>
          <Valuedisplay
            onMouseEnter={() => setIsEditing(true)}
            onClick={() => setIsEditing(true)}
          >
            {isEditing ? (
              <StyledInput
                autoFocus
                min={mincontrol * 100}
                onChange={(e) => {
                  const num = Number(e.target.value.replace(/[^0-9]/g, ""));
                  const scae = num / 100;
                  if (scae >= mincontrol) {
                    onChange(scae);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setIsEditing(false);
                  }
                }}
                onMouseLeave={() => setIsEditing(false)}
                onBlur={() => setIsEditing(false)}
                value={displayScale}
                defaultValue={displayScale}
                type="number"
              />
            ) : (
              <>
                <ReadonlyValue>{displayScale}</ReadonlyValue>
                <PercentText>%</PercentText>
              </>
            )}
          </Valuedisplay>
          {canReset && (
            <ReloadIcon
              onClick={() => {
                onReset?.();
              }}
              color="white"
            />
          )}
        </ControlsContainer>
      </Controls>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 10px;
  box-sizing: border-box;
  padding: 10px 24px;
`;

const Controls = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  height: 24px;
  box-sizing: border-box;
  border-radius: 4px;
  padding: 4px;
  background-color: ${colors.color_editor_bg_on_dark};
  box-shadow: ${colors.color_editor_bg_on_dark} 0px 0px 0px 16px inset;
`;

const ControlsContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  height: 16px;
  box-sizing: border-box;
`;

const Valuedisplay = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 1px;
  height: 16px;
  box-sizing: border-box;
`;

const ReadonlyValue = styled.span`
  color: rgba(124, 124, 124, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const PercentText = styled.span`
  color: rgba(124, 124, 124, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
`;

const StyledInput = styled.input`
  border: none;
  outline: none;
  border-radius: 4px;
  color: white;
  background-color: transparent;
  width: 32px;

  /* hide number arrow */
  ::-webkit-inner-spin-button,
  ::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;
