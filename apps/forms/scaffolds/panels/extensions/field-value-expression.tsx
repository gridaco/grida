"use client";

import React, { useEffect, useReducer, useState } from "react";
import {
  PanelPropertyField,
  PanelPropertyFields,
  PanelPropertySection,
  PanelPropertySectionTitle,
} from "@/components/panels/side-panel";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { LockClosedIcon, MixIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { EditValueExpression } from "./v-edit";
import PropertyAccessDropdownMenu from "@/scaffolds/sidecontrol/controls/context/variable";

export function FieldValueExpression() {
  const data = {
    fields: {
      a: "string",
      b: "number",
      c: {
        d: "boolean",
      },
    },
  };
  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>Computed Value</PanelPropertySectionTitle>
      <PanelPropertyFields>
        <PanelPropertyField
          label={"Value"}
          description={
            <>
              The value of the input will be computed based on the provided
              formula.
            </>
          }
        >
          <PropertyAccessDropdownMenu data={data} asChild>
            <Button variant="outline" type="button">
              <MixIcon className="me-2" />
              <>Set Value Expression</>
            </Button>
          </PropertyAccessDropdownMenu>
          {/* <Dialog>
            <DialogTrigger>
              <div>
                <Button variant="outline" type="button">
                  <MixIcon className="me-2" />
                  <>Set Value Expression</>
                </Button>
              </div>
            </DialogTrigger>
            <DialogContent className="min-w-full h-screen p-0">
              <EditValueExpression />
            </DialogContent>
          </Dialog> */}
        </PanelPropertyField>
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}
