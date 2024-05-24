"use client";

import React from "react";
import resources from "@/i18n";
import { TemplateEditor, getPropTypes } from "@/scaffolds/template-editor";
import { Component as FormCompleteDefault } from "@/theme/templates/formcomplete/default";
import { Component as FormCompleteReceipt01 } from "@/theme/templates/formcomplete/receipt01";

function getComponent(template_id: string) {
  switch (template_id) {
    case "default":
      return FormCompleteDefault;
    case "receipt01":
      return FormCompleteReceipt01;
    default:
      return FormCompleteDefault;
  }
}

export default function TemplatingDevPage() {
  const lang = "en";
  return (
    <TemplateEditor
      getComponent={getComponent}
      getPropTypes={(template_id) => {
        return getPropTypes(
          resources[lang as keyof typeof resources].translation["formcomplete"][
            template_id as keyof (typeof resources)["en"]["translation"]["formcomplete"]
          ]
        );
      }}
      onSave={(data) => {
        console.log(data);
      }}
    />
  );
}
