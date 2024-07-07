"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormPageBackgroundSchema } from "@/types";
import { Button } from "@/components/ui/button";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

const backgrounds = [
  { name: "None", value: "" },
  { name: "Aurora", value: `${HOST_NAME}/theme/embed/backgrounds/aurora` },
  { name: "Dots", value: `${HOST_NAME}/theme/embed/backgrounds/dots` },
  { name: "Grid", value: `${HOST_NAME}/theme/embed/backgrounds/grid` },
  {
    name: "Grid (small)",
    value: `${HOST_NAME}/theme/embed/backgrounds/grid?variant=sm`,
  },
  { name: "Globe", value: `${HOST_NAME}/theme/embed/backgrounds/globe` },
  {
    name: "Shader Gradient 00 Halo",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/01`,
  },
  {
    name: "Shader Gradient 01 Pensive",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/01`,
  },
  {
    name: "Shader Gradient 02 Mint",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/02`,
  },
  {
    name: "Shader Gradient 03 Interstella",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/03`,
  },
  {
    name: "Shader Gradient 04 Nightly night",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/04`,
  },
  {
    name: "Shader Gradient 05 Viola orientalis",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/05`,
  },
  {
    name: "Shader Gradient 06 Universe",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/06`,
  },
  {
    name: "Shader Gradient 07 Sunset",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/07`,
  },
  {
    name: "Shader Gradient 08 Madarin",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/08`,
  },
  {
    name: "Shader Gradient 09 Cotton candy",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/09`,
  },
] as const;

export function CustomPageBackgroundPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    background?: FormPageBackgroundSchema;
  };
}) {
  const [src, setSrc] = useState(init.background?.src);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Dynamic Backgrounds</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/page-background"
          action="/private/editor/settings/page-background"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <Select
            name="src"
            value={src}
            onValueChange={(value) => setSrc(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {backgrounds.map((background) => (
                <SelectItem value={background.value}>
                  {background.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </form>
        {src && (
          <div className="mt-4 flex items-center justify-center select-none">
            <iframe
              key={src}
              src={src}
              // @ts-ignore
              allowtransparency="true"
              className="w-full h-96 rounded-md overflow-hidden"
              style={{ border: 0 }}
            />
          </div>
        )}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/settings/page-background" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
