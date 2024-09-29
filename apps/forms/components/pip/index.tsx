"use client";

import React from "react";
import Draggable from "react-draggable";
import { Card } from "../ui/card";
import { cn } from "@/utils";

export function PictureInPicture({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <Draggable
      defaultClassName="transition-transform duration-75"
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
      <Card className={cn("overflow-hidden", className)}>{children}</Card>
    </Draggable>
  );
}
