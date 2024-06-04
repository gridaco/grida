"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function ClosingFormPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_force_closed: boolean;
    // is_close_on_schedule_enabled: boolean;
  };
}) {
  const [is_force_close_on, set_is_force_close_on] = useState(
    init.is_force_closed
  );

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Close Form</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/force-close-form"
          action="/private/editor/settings/force-close-form"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex items-center space-x-2">
            <Switch
              id="is_force_closed"
              name="is_force_closed"
              checked={is_force_close_on}
              onCheckedChange={set_is_force_close_on}
            />
            <Label htmlFor="is_force_closed">Force-Close this Form</Label>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/settings/force-close-form" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
