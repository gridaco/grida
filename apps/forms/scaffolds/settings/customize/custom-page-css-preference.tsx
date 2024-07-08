"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Editor, useMonaco } from "@monaco-editor/react";
import { useMonacoTheme } from "@/components/monaco";
import { useTheme } from "next-themes";

export function CustomPageCssPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    custom?: string;
  };
}) {
  const [css, setCss] = useState(init.custom);

  const monaco = useMonaco();
  const { resolvedTheme } = useTheme();
  useMonacoTheme(monaco, resolvedTheme ?? "light");

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Custom CSS</>} />
      <PreferenceBody>
        <form
          id="/private/editor/customize/page-custom-css"
          action="/private/editor/customize/page-custom-css"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <input type="hidden" name="css" value={css} />
          <Editor
            className="rounded overflow-hidden border"
            onChange={setCss}
            width="100%"
            height={500}
            defaultLanguage="css"
            defaultValue={css}
            options={{
              // top padding
              padding: {
                top: 10,
              },
              tabSize: 2,
              fontSize: 13,
              minimap: {
                enabled: false,
              },
              glyphMargin: false,
              folding: false,
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
          />
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/customize/page-custom-css" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
