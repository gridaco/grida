"use client";

import React from "react";
import Draggable from "react-draggable";
import { Card } from "../ui/card";

export function PictureInPicture({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <Draggable
      defaultClassName="transition-transform"
      axis="both"
      // handle=".handle"
      // defaultPosition={{ x: 0, y: 0 }}
      // position={{null}}
      // grid={[25, 25]}
      // scale={1}
      // onStart={}
      // onDrag={this.handleDrag}
      // onStop={this.handleStop}
    >
      <Card className={className}>{children}</Card>
    </Draggable>
  );
}
