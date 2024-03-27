"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { PoweredByGridaWaterMark } from "@/components/powered-by-branding";

export function CustomizeBrandingPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_powered_by_branding_enabled: boolean;
  };
}) {
  const [enabled, setEnabled] = useState(init.is_powered_by_branding_enabled);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>{`"Powered by Grida" Branding`}</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/powered-by-branding"
          action="/private/editor/settings/powered-by-branding"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <Toggle
            name="is_powered_by_branding_enabled"
            value={enabled}
            label={enabled ? "Enabled" : "Disabled"}
            onChange={setEnabled}
          />
        </form>
        {enabled && (
          <div className="flex items-center justify-center select-none p-2 bg-neutral-500/10">
            <PoweredByGridaWaterMark />
          </div>
        )}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button
          form="/private/editor/settings/powered-by-branding"
          type="submit"
        >
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
