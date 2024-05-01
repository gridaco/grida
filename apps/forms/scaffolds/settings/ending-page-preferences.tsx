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

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export function EndingPagePreferences({
  form_id,
  lng = "en",
  title,
  init,
}: {
  form_id: string;
  lng?: string;
  title: string;
  init: {
    enabled: boolean;
    template_id: string | null;
  };
}) {
  const [template, setTemplate] = useState(init.template_id);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Ending Page Template</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/ending-page"
          action="/private/editor/settings/ending-page"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <Select
            name="template_id"
            value={template ?? undefined}
            onValueChange={setTemplate}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Ending Page Template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={""}>None</SelectItem>
              <SelectItem value="receipt01">Receipt 01</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 opacity-80">
            Enabling ending page will disable redirection
          </p>
        </form>
        {template && (
          <div className="mt-4 flex items-center justify-center select-none">
            <iframe
              key={template}
              src={
                HOST_NAME +
                `/templates/embed/${lng}/formcomplete/${template}?title=${encodeURIComponent(title)}`
              }
              className="w-full h-96"
              style={{ border: 0 }}
            />
          </div>
        )}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button
          form="/private/editor/settings/ending-page"
          type="submit"
          className={cls_save_button}
        >
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
