import React from "react";
import styled from "@emotion/styled";
import { ArrowRightIcon } from "@radix-ui/react-icons";
export function HomePrimaryInputNextButton({
  disabled = false,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  const color = disabled ? "#c4c4c4" : "#00a0ff";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <ArrowRightIcon width={24} height={24} fontSize={24} color={color} />
    </div>
  );
}
