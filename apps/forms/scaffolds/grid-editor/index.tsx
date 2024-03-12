"use client";

import React, { useState } from "react";
import { Grid } from "../grid";
import {
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
import { FormFieldPreview } from "@/components/formfield";
import { FormFieldType } from "@/types";
import { capitalCase, snakeCase } from "change-case";

export function GridEditor({ ...props }: React.ComponentProps<typeof Grid>) {
  const [newFieldPanelOpen, setNewFieldPanelOpen] = useState(false);

  return (
    <>
      <CreateNewFieldPanel
        open={newFieldPanelOpen}
        onOpenChange={setNewFieldPanelOpen}
      />
      <Grid
        columns={props.columns}
        rows={props.rows}
        onAddNewFieldClick={() => {
          setNewFieldPanelOpen(true);
        }}
      />
    </>
  );
}

function CreateNewFieldPanel({
  ...props
}: React.ComponentProps<typeof SidePanel>) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [helpText, setHelpText] = useState("");
  const [type, setType] = useState<FormFieldType>("text");
  const [required, setRequired] = useState(false);

  const preview_label = buildPreviewLabel({
    name,
    label,
    required,
  });

  const preview_placeholder =
    placeholder || convertToPlainText(label) || convertToPlainText(name);

  return (
    <SidePanel {...props}>
      <PanelHeader>New Field</PanelHeader>
      <PanelContent>
        <PanelPropertySection>
          <PanelPropertySectionTitle>Preview</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <div className="w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
              <FormFieldPreview
                name={name}
                type={type}
                label={preview_label}
                labelCapitalize={!!label}
                placeholder={preview_placeholder}
                helpText={helpText}
                required={required}
              />
            </div>
          </PanelPropertyFields>
        </PanelPropertySection>
        <PanelPropertySection>
          <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <PanelPropertyField label={"Type"}>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FormFieldType)}
              >
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="email">Email</option>
                <option value="number">Number</option>
              </select>
            </PanelPropertyField>
            <PanelPropertyField
              label={"Name"}
              description="The input's name, identifier. Recommended to use lowercase and use an underscore to separate words e.g. column_name"
            >
              <PropertyTextInput
                required
                autoFocus
                placeholder={"field_name"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </PanelPropertyField>
            <PanelPropertyField
              label={"Label"}
              description="The label that will be displayed to the user"
            >
              <PropertyTextInput
                placeholder={"Label Text"}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </PanelPropertyField>
            <PanelPropertyField
              label={"Placeholder"}
              description="The placeholder text that will be displayed in the input when it's empty."
            >
              <PropertyTextInput
                placeholder={"Placeholder Text"}
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
              />
            </PanelPropertyField>
            <PanelPropertyField
              label={"Help Text"}
              description="A small hint that will be displayed next to the input to help the user understand what to input."
            >
              <PropertyTextInput
                placeholder={"Help Text"}
                value={helpText}
                onChange={(e) => setHelpText(e.target.value)}
              />
            </PanelPropertyField>
            <PanelPropertyField label={"Required"}>
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
            </PanelPropertyField>

            {/* <PropertyTextField
                label={"Name"}
                placeholder={"field_name"}
                description="Recommended to use lowercase and use an underscore to separate words e.g. column_name"
              /> */}
          </PanelPropertyFields>
        </PanelPropertySection>
      </PanelContent>
      <PanelFooter>
        <button className="rounded p-2 bg-neutral-100">Cancel</button>
        <button className="rounded p-2 bg-neutral-100">Save</button>
      </PanelFooter>
    </SidePanel>
  );
}

function buildPreviewLabel({
  name,
  label,
  required,
}: {
  name: string;
  label?: string;
  required?: boolean;
}) {
  let txt = label || convertToPlainText(name);
  if (required) {
    txt += " *";
  }
  return txt;
}

function convertToPlainText(input: string) {
  // Converts to snake_case then replaces underscores with spaces and capitalizes words
  return capitalCase(snakeCase(input)).toLowerCase();
}
