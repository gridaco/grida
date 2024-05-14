"use client";

import React, { useEffect, useState } from "react";
import {
  PanelClose,
  PanelContent,
  PanelFooter,
  PanelHeader,
  PanelPropertyField,
  PanelPropertyFields,
  PanelPropertySection,
  PanelPropertySectionTitle,
  PropertyTextInput,
  SidePanel,
} from "@/components/panels/side-panel";
import {
  FormFieldDefinition,
  FormInputType,
  FormResponse,
  FormFieldInit,
} from "@/types";
import { LockClosedIcon } from "@radix-ui/react-icons";
import toast from "react-hot-toast";
import { Editor } from "@monaco-editor/react";
import { fmt_local_index } from "@/utils/fmt";

export function ResponseEditPanel({
  title,
  onSave,
  init,
  disableAI,
  ...props
}: React.ComponentProps<typeof SidePanel> & {
  title?: string;
  init?: Partial<{ response: FormResponse; field_defs: FormFieldDefinition[] }>;
  disableAI?: boolean;
  onSave?: (field: FormFieldInit) => void;
}) {
  const { response, field_defs } = init ?? {};

  const onSaveClick = () => {};

  return (
    <SidePanel {...props}>
      <PanelHeader>{title}</PanelHeader>
      <PanelContent>
        <PanelPropertySection>
          <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <PanelPropertyField label={"ID"}>
              <PropertyTextInput
                value={fmt_local_index(response?.local_index ?? NaN)}
                disabled
              />
            </PanelPropertyField>
            <PanelPropertyField label={"Instance ID"}>
              <PropertyTextInput value={response?.id} disabled />
            </PanelPropertyField>
            <PanelPropertyField label={"Created At"}>
              <PropertyTextInput value={response?.created_at} disabled />
            </PanelPropertyField>
          </PanelPropertyFields>
        </PanelPropertySection>
        <PanelPropertySection>
          <PanelPropertySectionTitle>Customer</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <PanelPropertyField label={"UUID"}>
              <PropertyTextInput value={response?.customer_id ?? ""} disabled />
            </PanelPropertyField>
            <PanelPropertyField label={"Browser"}>
              <PropertyTextInput value={response?.browser ?? ""} disabled />
            </PanelPropertyField>
            <PanelPropertyField label={"Platform"}>
              <PropertyTextInput
                value={response?.platform_powered_by ?? ""}
                disabled
              />
            </PanelPropertyField>
          </PanelPropertyFields>
        </PanelPropertySection>
        <form>
          <PanelPropertySection>
            <PanelPropertySectionTitle>Response</PanelPropertySectionTitle>
            <PanelPropertyFields>
              {field_defs?.map((def) => {
                const record = response?.fields?.find(
                  (f) => f.form_field_id === def.id
                );

                const txt = record?.value ? JSON.parse(record?.value) : "";

                return (
                  <PanelPropertyField key={def.id} label={def.name}>
                    <PropertyTextInput
                      autoFocus={false}
                      readOnly
                      placeholder={def.placeholder ?? ""}
                      value={txt}
                    />
                  </PanelPropertyField>
                );
              })}
            </PanelPropertyFields>
          </PanelPropertySection>
        </form>
        <PanelPropertySection>
          <PanelPropertySectionTitle>RAW</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <PanelPropertyField label={"JSON"}>
              <Editor
                className="rounded overflow-hidden shadow-sm border"
                height={400}
                defaultLanguage="json"
                defaultValue={JSON.stringify(response, null, 2)}
                options={{
                  readOnly: true,
                  padding: {
                    top: 10,
                  },
                  minimap: {
                    enabled: false,
                  },
                  tabSize: 2,
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  glyphMargin: false,
                }}
              />
            </PanelPropertyField>
          </PanelPropertyFields>
        </PanelPropertySection>
      </PanelContent>
      <PanelFooter>
        <PanelClose>
          <button className="rounded p-2 bg-neutral-100 dark:bg-neutral-900">
            Close
          </button>
        </PanelClose>
        {/* <button onClick={onSaveClick} className="rounded p-2 bg-neutral-100">
          Save
        </button> */}
      </PanelFooter>
    </SidePanel>
  );
}
