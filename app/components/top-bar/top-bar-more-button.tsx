import Reaact from "react";
import { Button } from "@editor-ui/button";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";

export function TopBarMoreButton() {
  return (
    <Button id="more">
      <DotsHorizontalIcon />
    </Button>
  );
}
