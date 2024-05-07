"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  cls_save_button,
  cls_textarea,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";

export function TrustedOriginPreferences({}: {}) {
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
                <textarea
                  name="allowed_origins_txt_csv"
                  className={cls_textarea}
                />
              </label>
            </div>
          </section>
        </div>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="redirect-uri" type="submit" className={cls_save_button}>
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
