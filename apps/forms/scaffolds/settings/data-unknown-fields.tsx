"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Select } from "@/components/select";

export function UnknownFieldPreferences({}: {}) {
  return (
    <PreferenceBox beta>
      <PreferenceBoxHeader heading={<>Handling unknown fields</>} />
      <PreferenceBody>
        <div className="flex flex-col gap-8">
          <section>
            <p className="opacity-80">
              When a form is submitted with fields that are not defined in the
              form schema, you can choose to ignore them or store them as
              metadata.
            </p>
            <div>
              <label>
                <Select>
                  <option>Accept the form with ignoring unknown fields</option>
                  <option>
                    Reject forms when if any unknown field is present
                  </option>
                </Select>
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
