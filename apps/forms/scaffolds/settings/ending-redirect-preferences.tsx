"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
  cls_input,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function EndingRedirectPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    redirect_after_response_uri: string;
    is_redirect_after_response_uri_enabled: boolean;
  };
}) {
  const [enabled, setEnabled] = useState(
    init.is_redirect_after_response_uri_enabled
  );

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Custom Redirect URI</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/redirect-uri"
          action="/private/editor/settings/redirect-uri"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="is_redirect_after_response_uri_enabled"
                name="is_redirect_after_response_uri_enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
              <Label htmlFor="is_redirect_after_response_uri_enabled">
                {enabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
            <label className="flex flex-col">
              <Input
                name="redirect_after_response_uri"
                type="text"
                disabled={!enabled}
                defaultValue={init.redirect_after_response_uri}
                placeholder="https://.."
                pattern="https://.*"
                className={cls_input}
              />
              <PreferenceDescription>
                Redirect to a custom URL after form submission. Leave empty for
                default behavior.
              </PreferenceDescription>
            </label>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/settings/redirect-uri" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
