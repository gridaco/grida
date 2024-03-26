"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";

export function TrustedOriginPreferences({}: {}) {
  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Trusted origins</>} />
      <PreferenceBody>
        <div className="flex flex-col gap-8">
          <section>
            <h3>Allowed origins</h3>
            <p className="opacity-80">
              Add origins where the form can be embedded. Leave empty to allow
              all origins.
            </p>
            <div>
              <label>
                <textarea />
              </label>
            </div>
          </section>
        </div>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button form="redirect-uri" type="submit">
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
