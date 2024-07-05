"use client";

import React, { useEffect, useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { FormStyleSheetV1Schema } from "@/types";
import { Button } from "@/components/ui/button";
import palettes from "@/theme/palettes";
import * as variants from "@/theme/palettes";
import clsx from "clsx";
import { Badge } from "@/components/ui/badge";
import { useEditorState } from "../editor";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export function CustomPagePalettePreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    palette?: FormStyleSheetV1Schema["palette"];
  };
}) {
  const [state, dispatch] = useEditorState();
  const [palette, setPalette] = useState(init.palette);

  useEffect(() => {
    dispatch({
      type: "editor/theme/palette",
      palette,
    });
  }, [dispatch, palette]);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Color Palette</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/page-palette"
          action="/private/editor/settings/page-palette"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <input type="hidden" name="palette" value={palette} />
          {palette && (
            <div className="py-4">
              <Badge variant="outline">{palette}</Badge>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {Object.keys(variants).map((variant) => {
              const palettes = variants[variant as keyof typeof variants];
              return (
                <>
                  <h2 className="text-sm font-mono text-muted-foreground">
                    {variant}
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(palettes).map((key) => {
                      const colors = palettes[key as keyof typeof palettes];
                      const primary: any = colors["light"]["--primary"];
                      return (
                        <button
                          type="button"
                          key={key}
                          data-selected={key === palette}
                          onClick={() => {
                            setPalette(key as keyof typeof palettes);
                            // onPresetChange?.(key);
                          }}
                          className={clsx(
                            "w-6 h-6 border-2 rounded-full",
                            "data-[selected='true']:outline data-[selected='true']:outline-foreground data-[selected='true']:border-background"
                          )}
                          style={{
                            backgroundColor: `hsl(${primary.h}, ${primary.s}%, ${primary.l}%)`,
                          }}
                        />
                      );
                    })}
                  </div>
                </>
              );
            })}
          </div>

          {/* <div className="flex flex-wrap gap-1">
            {Object.keys(palettes).map((key) => {
              const colors = palettes[key as keyof typeof palettes];
              const primary = colors["light"]["--primary"];
              return (
                <button
                  type="button"
                  key={key}
                  data-selected={key === palette}
                  onClick={() => {
                    setPalette(key as keyof typeof palettes);
                    // onPresetChange?.(key);
                  }}
                  className={clsx(
                    "w-6 h-6 border-2 rounded-full",
                    "data-[selected='true']:outline data-[selected='true']:outline-foreground data-[selected='true']:border-background"
                  )}
                  style={{
                    backgroundColor: `hsl(${primary.h}, ${primary.s}%, ${primary.l}%)`,
                  }}
                />
              );
            })}
          </div> */}
        </form>
        {/* {palette && (
          <div className="mt-4 flex items-center justify-center select-none">
            <PlaygroundPreview
              schema={"{}" || ""}
              css={("" || "") + "\n" + ("" || "")}
              // dark={}
            />
          </div>
        )} */}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/settings/page-palette" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
