"use client";

import React, { useEffect, useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  SectorBlocks,
  cls_input,
  cls_save_button,
} from "@/components/preferences";
import clsx from "clsx";

export function RestrictNumberOfResponseByCustomer({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_max_form_responses_by_customer_enabled: boolean;
    max_form_responses_by_customer?: number | null;
  };
}) {
  const [enabled, setEnabled] = useState(
    init.is_max_form_responses_by_customer_enabled
  );
  const [n, setN] = useState(init.max_form_responses_by_customer || 1);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader
        heading={<>Limit number of responses by customer</>}
      />
      <PreferenceBody>
        <form
          id="/private/editor/settings/max-responses-by-customer"
          action="/private/editor/settings/max-responses-by-customer"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col">
            <Toggle
              name="is_max_form_responses_by_customer_enabled"
              value={enabled}
              label={enabled ? "Enabled" : "Disabled"}
              onChange={setEnabled}
            />
            <div className={clsx(!enabled && "hidden")}>
              <input
                name="max_form_responses_by_customer"
                type="number"
                min={1}
                value={n}
                onChange={(e) => {
                  setN(parseInt(e.target.value));
                }}
                className={cls_input}
              />
            </div>
            {enabled && n ? (
              <>
                Limit to {n} {txt_response_plural(n)} per user.
                <>{n === 1 && <>{txt_no_multiple_response_description}</>}</>
              </>
            ) : (
              <>Users can submit an unlimited number of responses.</>
            )}
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button
          form="/private/editor/settings/max-responses-by-customer"
          type="submit"
          className={cls_save_button}
        >
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

export function MaxRespoonses({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_max_form_responses_in_total_enabled: boolean;
    max_form_responses_in_total: number | null;
  };
}) {
  const [enabled, setEnabled] = useState(
    init.is_max_form_responses_in_total_enabled
  );
  const [n, setN] = useState(init.max_form_responses_in_total || 100);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Limit number of total responses</>} />
      <PreferenceBody>
        <p>
          Set maximum number of responses allowed. This is useful when you have
          limited number of offers, inventory or tickets.
        </p>
        <form
          id="/private/editor/settings/max-responses-in-total"
          action="/private/editor/settings/max-responses-in-total"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col">
            <Toggle
              name="is_max_form_responses_in_total_enabled"
              value={enabled}
              label={enabled ? "Enabled" : "Disabled"}
              onChange={setEnabled}
            />
            <div className={clsx(!enabled && "hidden")}>
              <label className="flex flex-col gap-2 cursor-pointer">
                <span>Maximum number of responses allowed</span>
                <input
                  name="max_form_responses_in_total"
                  type="number"
                  placeholder="Leave empty for unlimited responses"
                  min={1}
                  value={n}
                  onChange={(e) => {
                    setN(parseInt(e.target.value));
                  }}
                  className={cls_input}
                />
              </label>
            </div>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button
          form="/private/editor/settings/max-responses-in-total"
          type="submit"
          className={cls_save_button}
        >
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

const txt_no_multiple_response_description =
  "Users won't be able to submit multiple responses.";

const txt_response_plural = (n: number) => {
  return n === 1 ? "response" : "responses";
};
