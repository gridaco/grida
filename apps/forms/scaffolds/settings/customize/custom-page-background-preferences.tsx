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
import { backgrounds } from "@/theme/k";

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
          id="/private/editor/customize/page-background"
          action="/private/editor/customize/page-background"
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
              {backgrounds.map((background, i) => (
                <SelectItem key={i} value={background.value}>
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
        <Button form="/private/editor/customize/page-background" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
