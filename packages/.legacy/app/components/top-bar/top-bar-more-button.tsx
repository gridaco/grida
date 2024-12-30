import Reaact from "react";
import { Button } from "@editor-ui/button";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { StyledButton } from "./button-style";

export function TopBarMoreButton() {
  return (
    <StyledButton id="more">
      <DotsHorizontalIcon />
    </StyledButton>
  );
}
