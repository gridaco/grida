"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { PoweredByGridaWaterMark } from "@/components/powered-by-branding";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function CustomPoweredByBrandingPreferences({
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
          id="/private/editor/customize/powered-by-branding"
          action="/private/editor/customize/powered-by-branding"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex items-center space-x-2">
            <Switch
              id="is_powered_by_branding_enabled"
              name="is_powered_by_branding_enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="is_powered_by_branding_enabled">
              {enabled ? "Enabled" : "Disabled"}
            </Label>
          </div>
        </form>
        {enabled && (
          <div className="mt-10 flex items-center justify-center select-none p-4 border rounded-sm">
            <PoweredByGridaWaterMark />
          </div>
        )}
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="/private/editor/customize/powered-by-branding"
          type="submit"
        >
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
