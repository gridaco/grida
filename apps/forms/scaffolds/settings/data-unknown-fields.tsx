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
import { FormResponseUnknownFieldHandlingStrategyType } from "@/types";

export function UnknownFieldPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    unknown_field_handling_strategy: FormResponseUnknownFieldHandlingStrategyType;
  };
}) {
  const [strategy, setStrategy] =
    useState<FormResponseUnknownFieldHandlingStrategyType>(
      init.unknown_field_handling_strategy
    );

  return (
    <PreferenceBox beta>
      <PreferenceBoxHeader heading={<>Handling unknown fields</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/unknown-fields"
          action="/private/editor/settings/unknown-fields"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-8">
            <section>
              <p className="opacity-80">
                When a form is submitted with fields that are not defined in the
                form schema, you can choose to ignore them or store them as
                metadata.
              </p>
              <div className="mt-4 flex flex-col gap-1">
                <Select
                  name="unknown_field_handling_strategy"
                  value={strategy}
                  onChange={(e) => {
                    setStrategy(e.target.value as any);
                  }}
                >
                  <option value="accept">Accept</option>
                  <option value="ignore">Ignore</option>
                  <option value="reject">Reject</option>
                </Select>
                <div className="opacity-80">
                  {strategy_descriptions[strategy]}
                </div>
              </div>
            </section>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button form="/private/editor/settings/unknown-fields" type="submit">
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

const strategy_descriptions = {
  accept: "This will create a new field in the form schema.",
  ignore: "This will ignore the field and continue.",
  reject: "This will reject the field and throw an error.",
} as const;
