"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";

export function ResponsePreferences() {
  return (
    <div className="flex flex-col gap-8">
      <RestrictNumberOfResponseByCustomer />
      <MaxRespoonses />
    </div>
  );
}

function MaxRespoonses() {
  const [enabled, setEnabled] = useState(false);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Maximum responses</>} />
      <PreferenceBody>
        <div className="flex flex-col">
          <Toggle
            value={enabled}
            label={enabled ? "Enabled" : "Disabled"}
            onChange={setEnabled}
          />
          {enabled && (
            <div>
              <label className="flex flex-col gap-2 cursor-pointer">
                <span>Maximum number of responses allowed</span>
                <input
                  type="number"
                  placeholder="Leave empty for unlimited responses"
                  min="1"
                />
              </label>
            </div>
          )}
        </div>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button>Save</button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

function RestrictNumberOfResponseByCustomer() {
  const [enabled, setEnabled] = useState(false);

  return (
    <PreferenceBox beta>
      <PreferenceBoxHeader heading={<>Limit number of responses</>} />
      <PreferenceBody>
        <div className="flex flex-col">
          <Toggle
            value={enabled}
            label={enabled ? "Enabled" : "Disabled"}
            onChange={setEnabled}
          />
          {enabled && (
            <div>
              Limit to 1 response per user. Users won&apos;t be able to submit
              multiple responses.
            </div>
          )}
        </div>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button>Save</button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
