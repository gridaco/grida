"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";

export function RedirectPreferences({
  form_id,
  defaultValue,
}: {
  form_id: string;
  defaultValue: string;
}) {
  const [enabled, setEnabled] = useState(!!defaultValue);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Custom Redirect URI</>} />
      <PreferenceBody>
        <form
          id="redirect-uri"
          action="/private/editor/settings/redirect-uri"
          method="POST"
        >
          <Toggle
            value={enabled}
            label={enabled ? "Enabled" : "Disabled"}
            onChange={setEnabled}
          />
          {enabled && (
            <div className="flex flex-col gap-8">
              <label className="flex flex-col gap-2">
                <input type="hidden" name="form_id" value={form_id} />
                <input
                  name="redirect_uri"
                  type="text"
                  defaultValue={defaultValue}
                  placeholder="https://.."
                  pattern="https://.*"
                />
                <span>
                  Redirect to a custom URL after form submission. Leave empty
                  for default behavior.
                </span>
              </label>
            </div>
          )}
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button form="redirect-uri" type="submit">
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
