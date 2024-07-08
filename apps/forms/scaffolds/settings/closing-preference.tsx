"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PrivateEditorApi } from "@/lib/private";
import toast from "react-hot-toast";

export function ClosingFormPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_force_closed: boolean;
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
          id="force-close-form"
          onSubmit={(e) => {
            e.preventDefault();
            const req = PrivateEditorApi.Settings.updateFormAccessForceClose({
              form_id,
              closed: is_force_close_on,
            });
            toast.promise(req, {
              loading: "Saving...",
              success: "Form closed",
              error: "Failed to close form",
            });
          }}
        >
          <div className="flex items-center space-x-2">
            <Switch
              id="is_force_closed"
              checked={is_force_close_on}
              onCheckedChange={set_is_force_close_on}
            />
            <Label htmlFor="is_force_closed">Force-Close this Form</Label>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="force-close-form" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
