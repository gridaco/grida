"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Select } from "@/components/select";
import type { FormsPageLanguage } from "@/types";
import {
  language_label_map,
  supported_form_page_languages,
} from "@/k/supported_languages";

export function FormPageLanguagePreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    default_form_page_language: FormsPageLanguage;
  };
}) {
  const [language, setLanguage] = useState<FormsPageLanguage>(
    init.default_form_page_language
  );

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Page Language</>} />
      <PreferenceBody>
        <p className="opacity-80">
          Choose the language that your customers will be seeing.
        </p>
        <form
          id="/private/editor/settings/default-language"
          action="/private/editor/settings/default-language"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-8">
            <section>
              <div className="mt-4 flex flex-col gap-1">
                <Select
                  name="default_form_page_language"
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value as any);
                  }}
                >
                  {supported_form_page_languages.map((lang) => (
                    <option key={lang} value={lang}>
                      {language_label_map[lang]}
                    </option>
                  ))}
                </Select>
                <div className="opacity-80">
                  The form page will be displayed in{" "}
                  {language_label_map[language]}
                </div>
              </div>
            </section>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <button form="/private/editor/settings/default-language" type="submit">
          Save
        </button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
