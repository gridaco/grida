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
  return (
    <SidePanel {...props}>
      <PanelHeader>New Field</PanelHeader>
      <PanelContent>
        <PanelPropertySection>
          <PanelPropertySectionTitle>Preview</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <div className="w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
              <FormFieldPreview />
            </div>
          </PanelPropertyFields>
        </PanelPropertySection>
        <PanelPropertySection>
          <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <PanelPropertyField
              label={"Name"}
              description="Recommended to use lowercase and use an underscore to separate words e.g. column_name"
            >
              <PropertyTextInput placeholder={"field_name"} />
            </PanelPropertyField>
            <PanelPropertyField label={"Type"}>
              <select>
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="email">Email</option>
                <option value="number">Number</option>
              </select>
            </PanelPropertyField>
            <PanelPropertyField label={"Required"}>
              <input type="checkbox" />
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
