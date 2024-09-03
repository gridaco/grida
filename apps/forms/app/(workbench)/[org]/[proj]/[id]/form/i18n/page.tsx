"use client";

import Invalid from "@/components/invalid";
import { useEditorState } from "@/scaffolds/editor";
import { I18nEditor } from "@/scaffolds/i18n-editor";

export default function FormI18nPage() {
  const [state] = useEditorState();
  const { lang, lang_default, langs, messages } = state.document;

  if (langs.length <= 1) {
    return <Invalid />;
  }

  return (
    <main className="w-full h-full">
      <I18nEditor />
    </main>
  );
}
