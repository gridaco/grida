"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
  cls_save_button,
} from "@/components/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
              <SelectItem value={"default"}>Default</SelectItem>
              <SelectItem value="receipt01">Receipt 01</SelectItem>
            </SelectContent>
          </Select>
          <PreferenceDescription>
            Enabling ending page will disable redirection
          </PreferenceDescription>
        </form>
        {template && (
          <EndingPagePreview template={template} title={title} lng={lng} />
        )}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/settings/ending-page" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

function EndingPagePreview({
  template,
  lng,
  title,
}: {
  template: string;
  lng: string;
  title: string;
}) {
  switch (template) {
    case "receipt01": {
      return (
        <iframe
          key={template}
          src={
            HOST_NAME +
            `/templates/embed/${lng}/formcomplete/${template}?title=${encodeURIComponent(title)}`
          }
          className="w-full h-96"
          style={{ border: 0 }}
        />
      );
    }
    case "default": {
      return (
        <iframe
          key={template}
          src={
            HOST_NAME +
            `/templates/embed/${lng}/formcomplete/default?title=${encodeURIComponent(title)}`
          }
          className="w-full h-96"
          style={{ border: 0 }}
        />
      );
    }
  }
}
