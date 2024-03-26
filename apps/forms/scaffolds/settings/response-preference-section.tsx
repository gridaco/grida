"use client";

import React, { useEffect, useState } from "react";
import { Toggle } from "@/components/toggle";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  cls_input,
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
  const [n, setN] = useState(10000);

  return (
    <PreferenceBox beta>
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
                  name="max_responses_per_customer"
                  type="number"
                  placeholder="Leave empty for unlimited responses"
                  min={1}
                  defaultValue={1}
                  value={n}
                  onChange={(e) => {
                    setN(parseInt(e.target.value));
                  }}
                  className={cls_input}
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
  const [n, setN] = useState(0);

  useEffect(() => {
    setN(enabled ? 1 : 0);
  }, [enabled]);

  return (
    <PreferenceBox beta>
      <PreferenceBoxHeader
        heading={<>Limit number of responses by customer</>}
      />
      <PreferenceBody>
        <div className="flex flex-col">
          <Toggle
            value={enabled}
            label={enabled ? "Enabled" : "Disabled"}
            onChange={setEnabled}
          />
          {enabled ? (
            <div>
              <input
                name="max_responses_per_customer"
                type="number"
                min={1}
                defaultValue={1}
                value={n}
                onChange={(e) => {
                  setN(parseInt(e.target.value));
                }}
                className={cls_input}
              />
              <div>
                Limit to {n} {txt_response_plural(n)} per user.
                <>{n === 1 && <>{txt_no_multiple_response_description}</>}</>
              </div>
            </div>
          ) : (
            <>{txt_no_multiple_response_description}</>
          )}
        </div>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button>Save</button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

const txt_no_multiple_response_description =
  "Users won't be able to submit multiple responses.";

const txt_response_plural = (n: number) => {
  return n === 1 ? "response" : "responses";
};
