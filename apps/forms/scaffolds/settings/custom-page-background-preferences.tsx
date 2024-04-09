"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  cls_save_button,
} from "@/components/preferences";
import { Select } from "@/components/select";
import { FormPageBackgroundSchema } from "@/types";

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
            onChange={(e) => setSrc(e.target.value)}
          >
            <option value="">None</option>
            <option value={`${HOST_NAME}/theme/embed/backgrounds/aurora`}>
              Aurora
            </option>
            <option value={`${HOST_NAME}/theme/embed/backgrounds/dots`}>
              Dots
            </option>
            <option value={`${HOST_NAME}/theme/embed/backgrounds/grid`}>
              Grid
            </option>
            <option
              value={`${HOST_NAME}/theme/embed/backgrounds/grid?variant=sm`}
            >
              Grid (small)
            </option>
            <option value={`${HOST_NAME}/theme/embed/backgrounds/globe`}>
              Globe
            </option>
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
        <button
          form="/private/editor/settings/page-background"
          type="submit"
          className={cls_save_button}
        >
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
