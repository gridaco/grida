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
import { Button } from "@/components/ui/button";
import { sections } from "@/theme/section";

export function CustomSectionStylePreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    section?: string;
  };
}) {
  const [css, setCss] = useState(init.section);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Section Style</>} />
      <PreferenceBody>
        <form
          id="/private/editor/customize/page-section-style"
          action="/private/editor/customize/page-section-style"
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
              {sections.map((section, i) => (
                <SelectItem value={section.css}>{section.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </form>
        {css && (
          <div className="mt-4 flex items-center justify-center select-none">
            <section className={css}>
              <p>This is a sample section with the selected style.</p>
            </section>
          </div>
        )}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="/private/editor/customize/page-section-style"
          type="submit"
        >
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
