"use client";

import React, { useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
  cls_input,
  cls_save_button,
} from "@/components/preferences";
import clsx from "clsx";

export function ClosingFormPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_force_closed: boolean;
    // is_close_on_schedule_enabled: boolean;
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
          id="/private/editor/settings/force-close-form"
          action="/private/editor/settings/force-close-form"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col">
            <Toggle
              name="is_force_closed"
              value={is_force_close_on}
              label={is_force_close_on ? "Open Form" : "Force Close Form"}
              onChange={set_is_force_close_on}
            />
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button
          form="/private/editor/settings/force-close-form"
          type="submit"
          className={cls_save_button}
        >
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
