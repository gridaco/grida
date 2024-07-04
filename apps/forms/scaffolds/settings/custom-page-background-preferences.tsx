"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  cls_save_button,
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
              <SelectItem value={""}>None</SelectItem>
              <SelectItem value={`${HOST_NAME}/theme/embed/backgrounds/aurora`}>
                Aurora
              </SelectItem>
              <SelectItem value={`${HOST_NAME}/theme/embed/backgrounds/dots`}>
                Dots
              </SelectItem>
              <SelectItem value={`${HOST_NAME}/theme/embed/backgrounds/grid`}>
                Grid
              </SelectItem>
              <SelectItem
                value={`${HOST_NAME}/theme/embed/backgrounds/grid?variant=sm`}
              >
                Grid (small)
              </SelectItem>
              <SelectItem value={`${HOST_NAME}/theme/embed/backgrounds/globe`}>
                Globe
              </SelectItem>
            </SelectContent>
          </Select>
        </form>
        {src && (
          <div className="mt-4 flex items-center justify-center select-none">
            <iframe
              key={src}
              src={src}
              className="w-full h-96"
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
