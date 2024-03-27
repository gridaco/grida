import React from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";

export function AboutThisForm({ form_id }: { form_id: string }) {
  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>About</>} />
      <PreferenceBody>
        <label>
          <span className="text-sm opacity-80 font-mono">form_id</span>
          <div className="mt-2">
            <CopyToClipboardInput value={form_id} />
          </div>
        </label>
        {/* <form
          id="/private/editor/settings/unknown-fields"
          action="/private/editor/settings/unknown-fields"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
        </form> */}
      </PreferenceBody>
      {/* <PreferenceBoxFooter>
        <button form="/private/editor/settings/unknown-fields" type="submit">
          Save
        </button>
      </PreferenceBoxFooter> */}
    </PreferenceBox>
  );
}
