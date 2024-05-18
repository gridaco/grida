"use client";

import React from "react";

import { Button } from "@/components/ui/button";

import {
  ButtonIcon,
  ImageIcon,
  Link2Icon,
  TextIcon,
  VideoIcon,
} from "@radix-ui/react-icons";

const blockpresets = [
  {
    type: "forms.grida.co/start-form-button",
    label: "Start Button",
    icon: <ButtonIcon />,
  },
  {
    type: "button",
    label: "Button",
    icon: <ButtonIcon />,
  },
  {
    type: "text",
    label: "Text",
    icon: <TextIcon />,
  },
  {
    type: "h1",
    label: "Heading",
    icon: <TextIcon />,
  },
  {
    type: "p",
    label: "Paragraph",
    icon: <TextIcon />,
  },
  {
    type: "link",
    label: "Link",
    icon: <Link2Icon />,
  },
  {
    type: "image",
    label: "Image",
    icon: <ImageIcon />,
  },
  {
    type: "video",
    label: "Video",
    icon: <VideoIcon />,
  },
] as const;

export function InsertPanel({ dispatch }: { dispatch: React.Dispatch<any> }) {
  return (
    <div className="p-4 flex flex-col gap-2 w-full">
      {blockpresets.map((block) => (
        <Button
          variant="outline"
          className="h-20"
          key={block.type}
          onClick={() => {
            dispatch({
              type: "blocks/new",
              // @ts-ignore TODO: handle presets
              block: block.type,
            });
          }}
        >
          {React.cloneElement(block.icon, {
            className: "w-6 h-6 mr-2",
          })}
          {block.label}
        </Button>
      ))}
    </div>
  );
}
