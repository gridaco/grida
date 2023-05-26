import React from "react";
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
    <Toggle.Root
      name={tooltip}
      onPressedChange={(pressed) => {
        setPressed(pressed);
      }}
      pressed={pressed}
      className="Toggle"
      aria-label={ariaLabel}
    >
      {pressed ? <>{on}</> : <>{off}</>}
    </Toggle.Root>
  );
}
