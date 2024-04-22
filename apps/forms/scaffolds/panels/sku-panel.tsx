"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
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
import { cls_save_button } from "@/components/preferences";

export function SkuEditPanel({
  title = "Track Options Inventory",
  ...props
}: React.ComponentProps<typeof SidePanel> & {
  title?: string;
}) {
  return (
    <SidePanel {...props}>
      <PanelHeader>{title}</PanelHeader>
      <PanelContent>
        <PanelPropertySection>
          <PanelPropertySectionTitle>Preview</PanelPropertySectionTitle>
          <PanelPropertyFields></PanelPropertyFields>
        </PanelPropertySection>
      </PanelContent>
      <PanelFooter>
        <PanelClose>
          <button
            onClick={() => {
              // Close the panel
            }}
            className="rounded p-2 bg-neutral-100 dark:bg-neutral-900"
          >
            Cancel
          </button>
        </PanelClose>
        <button
          type="submit"
          form="field-edit-form"
          className={cls_save_button}
        >
          Save
        </button>
      </PanelFooter>
    </SidePanel>
  );
}
