import React from "react";
import { Button } from "@editor-ui/button";
import { StyledButton } from "./button-style";

interface Props {
  contorlModal?: () => void;
}

export function TopBarShareButton(props: Props) {
  return (
    <>
      <StyledButton id="share" onClick={props.contorlModal}>
        Share
      </StyledButton>
    </>
  );
  // return <Button id="share">Share</Button>;
}
