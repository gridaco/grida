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
import { section_style_glass_morphism } from "@/theme/section/css";
import { Button } from "@/components/ui/button";

export function CustomSectionStylePreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    background?: FormPageBackgroundSchema;
    stylesheet?: any;
  };
}) {
  const [css, setCss] = useState(init.stylesheet?.section);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Section Style</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/page-section-style"
          action="/private/editor/settings/page-section-style"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <Select
            name="css"
            value={css}
            onValueChange={(value) => setCss(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Section Style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={""}>None</SelectItem>
              <SelectItem value={section_style_glass_morphism}>
                Glass Morphism
              </SelectItem>
            </SelectContent>
          </Select>
        </form>
        {css && (
          <div className="mt-4 flex items-center justify-center select-none">
            <section className={css}>
              <p className="text-neutral-900 dark:text-neutral-100">
                This is a sample section with the selected style.
              </p>
            </section>
          </div>
        )}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="/private/editor/settings/page-section-style"
          type="submit"
        >
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
