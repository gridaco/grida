"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
  cls_save_button,
} from "@/components/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <PreferenceBox>
      <PreferenceBoxHeader
        heading={<>Dynamic Fields</>}
        description={
          <>
            When a form is submitted with fields that are not defined in the
            form schema, you can choose to ignore them or store them as
            metadata.
          </>
        }
      />
      <PreferenceBody>
        <form
          id="/private/editor/settings/unknown-fields"
          action="/private/editor/settings/unknown-fields"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-8">
            <section>
              <div className="mt-4 flex flex-col gap-1">
                <Select
                  name="unknown_field_handling_strategy"
                  value={strategy}
                  onValueChange={(value) => {
                    setStrategy(value as any);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accept">Accept</SelectItem>
                    <SelectItem value="ignore">Ignore</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                  </SelectContent>
                </Select>
                <PreferenceDescription>
                  {strategy_descriptions[strategy]}
                </PreferenceDescription>
              </div>
            </section>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button
          form="/private/editor/settings/unknown-fields"
          type="submit"
          className={cls_save_button}
        >
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

const strategy_descriptions = {
  accept: "Accept form with creating new fields in schema.",
  ignore: "Accept form with ignoring unknown fields",
  reject:
    "Reject from. It will reject the request if unknown fields are found.",
} as const;
