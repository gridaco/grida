"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Inconsolata, Inter, Lora } from "next/font/google";
import type { FormStyleSheetV1Schema } from "@/types";
import { Ag } from "@/components/design/ag";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const lora = Lora({ subsets: ["latin"], display: "swap" });
const inconsolata = Inconsolata({ subsets: ["latin"], display: "swap" });

const fonts = {
  inter,
  lora,
  inconsolata,
};

export function CustomPageFontFamilyPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    "font-family"?: FormStyleSheetV1Schema["font-family"];
  };
}) {
  const [font, setFont] = useState(init["font-family"] ?? "inter");

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Type Style</>} />
      <PreferenceBody>
        <form
          id="/private/editor/customize/page-font-family"
          action="/private/editor/customize/page-font-family"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <input type="hidden" name="font-family" value={font} />
          <ToggleGroup
            type="single"
            defaultValue={font}
            value={font}
            onValueChange={(value) => setFont(value as any)}
          >
            <ToggleGroupItem value={"inter"} className="h-full w-24">
              <div className="flex flex-col items-center justify-center gap-2 p-2">
                <Ag fontClassName={fonts.inter.className} />
                Default
              </div>
            </ToggleGroupItem>
            <ToggleGroupItem value={"lora"} className="h-full w-24">
              <div className="flex flex-col items-center justify-center gap-2 p-2">
                <Ag fontClassName={fonts.lora.className} />
                Serif
              </div>
            </ToggleGroupItem>
            <ToggleGroupItem value={"inconsolata"} className="h-full w-24">
              <div className="flex flex-col items-center justify-center gap-2 p-2">
                <Ag fontClassName={fonts.inconsolata.className} />
                Mono
              </div>
            </ToggleGroupItem>
          </ToggleGroup>
        </form>
        <div className="p-2 border rounded mt-4">
          <Ag
            fontClassName={font ? fonts[font].className : ""}
            className="text-lg font-bold"
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </Ag>
          <br />
          <Ag
            fontClassName={font ? fonts[font].className : ""}
            className="text-sm"
          >
            Integer posuere congue sapien id egestas. Vivamus non tortor
            porttitor, elementum nunc sit amet, laoreet purus. Praesent id
            tincidunt ligula. Aenean in eleifend turpis. Morbi egestas sagittis
            nisl et scelerisque. Nullam blandit felis vel felis euismod, ut
            cursus nulla efficitur. Duis maximus interdum nunc, non rutrum sem
            aliquet quis. Cras sed purus elementum, lobortis orci nec, laoreet
            elit.
          </Ag>
        </div>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/customize/page-font-family" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
