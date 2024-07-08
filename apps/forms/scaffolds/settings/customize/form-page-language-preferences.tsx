"use client";

import React, { useState } from "react";
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
import type { FormsPageLanguage } from "@/types";
import {
  language_label_map,
  supported_form_page_languages,
} from "@/k/supported_languages";
import { Button } from "@/components/ui/button";

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
      <PreferenceBoxHeader
        heading={<>Page Language</>}
        description={
          <>Choose the language that your customers will be seeing.</>
        }
      />
      <PreferenceBody>
        <form
          id="/private/editor/customize/default-language"
          action="/private/editor/customize/default-language"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-8">
            <section>
              <div className="mt-4 flex flex-col gap-1">
                <Select
                  name="default_form_page_language"
                  value={language}
                  onValueChange={(value) => {
                    setLanguage(value as any);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {supported_form_page_languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {language_label_map[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PreferenceDescription>
                  The form page will be displayed in{" "}
                  <span className="font-bold font-mono">
                    {language_label_map[language]}
                  </span>
                </PreferenceDescription>
              </div>
            </section>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/customize/default-language" type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
