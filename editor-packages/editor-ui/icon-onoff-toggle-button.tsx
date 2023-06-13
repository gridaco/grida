import React from "react";
import styled from "@emotion/styled";
import * as Toggle from "@radix-ui/react-toggle";

export function IconToggleButton({
  on,
  off,
  tooltip,
  ariaLabel,
  defaultPressed = false,
  onChange,
}: {
  on: React.ReactNode;
  off: React.ReactNode;
  tooltip?: string;
  ariaLabel?: string;
  defaultPressed?: boolean;
  onChange?: (pressed: boolean) => void;
}) {
  const [pressed, setPressed] = React.useState(defaultPressed);

  React.useEffect(() => {
    onChange?.(pressed);
  }, [pressed]);

  return (
    <IconButton
      name={tooltip}
      onPressedChange={(pressed) => {
        setPressed(pressed);
      }}
      pressed={pressed}
      className="Toggle"
      aria-label={ariaLabel}
    >
      {pressed ? <>{on}</> : <>{off}</>}
    </IconButton>
  );
}

const IconButton = styled(Toggle.Root)`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  padding: 8px;
  color: inherit;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
  }
`;
