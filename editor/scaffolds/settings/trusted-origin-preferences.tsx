"use client";

import React from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function TrustedOriginPreferences() {
  return (
    <PreferenceBox beta disabled>
      <PreferenceBoxHeader heading={<>Trusted origins</>} />
      <PreferenceBody>
        <p className="opacity-80">
          Add comma separated origins where the form can be embedded. Leave
          empty to allow all origins.
        </p>
        <div className="flex flex-col gap-8 mt-2">
          <section>
            <div>
              <label>
                <Textarea disabled name="allowed_origins_txt_csv" />
              </label>
            </div>
          </section>
        </div>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="redirect-uri" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
