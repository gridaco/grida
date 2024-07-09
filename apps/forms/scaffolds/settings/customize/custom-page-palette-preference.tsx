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
import * as _variants from "@/theme/palettes";
import { Badge } from "@/components/ui/badge";
import { useEditorState } from "../../editor";
import { PaletteColorChip } from "@/components/design/palette-color-chip";

// exclude default
const { default: _, ...variants } = _variants;

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
          id="/private/editor/customize/page-palette"
          action="/private/editor/customize/page-palette"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <input type="hidden" name="palette" value={palette || ""} />
          <div className="py-4">
            <Badge variant="outline">{palette ?? "default"}</Badge>
          </div>
          <div className="flex flex-col gap-4">
            {Object.keys(variants).map((variant) => {
              const palettes = variants[variant as keyof typeof variants];
              return (
                <div key={variant} className="flex flex-col gap-2">
                  <h2 className="text-sm font-mono text-muted-foreground">
                    {variant}
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(palettes).map((key) => {
                      const colors = palettes[key as keyof typeof palettes];
                      const primary: any = colors["light"]["--primary"];
                      return (
                        <PaletteColorChip
                          key={key}
                          primary={primary}
                          onClick={() => {
                            setPalette((prev) =>
                              prev === key
                                ? undefined
                                : (key as keyof typeof palettes)
                            );
                          }}
                          selected={key === palette}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/customize/page-palette" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
