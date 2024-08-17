"use client";

import React, { useEffect, useMemo, useReducer, useState } from "react";
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
import { TProperties, TProperty, TSchema } from "@/lib/spock";
import { useEditorState } from "@/scaffolds/editor";
import { FormExpression } from "@/lib/forms/expression";
import toast from "react-hot-toast";
import { Tokens } from "@/ast";

function useFormSchema() {
  const [state] = useEditorState();
  const { fields } = state;

  return useMemo(
    () =>
      ({
        type: "object",
        description: "available field value references",
        properties: fields.reduce(
          (acc, f) => {
            acc[f.name] = FormExpression.schema.map_field_to_property(f);
            return acc;
          },
          {} as TProperties["properties"]
        ),
      }) satisfies TSchema,
    [fields]
  );
}

export function FieldValueExpression({
  expression,
  onChange,
}: {
  expression?: Tokens.TValueExpression;
  onChange?: (expression: Tokens.TValueExpression) => void;
}) {
  const [state] = useEditorState();
  const { fields } = state;
  const schema = useFormSchema();

  const onPropertySelect = (path: string[], { data }: any) => {
    const [field_name, ...access] = path;
    // find field id by name
    const field_id = fields.find((f) => f.name === field_name)?.id;
    if (!field_id) {
      toast.error("The selected field does not exist.");
      return;
    }

    const rejecttypes = ["null", "object", "array"];
    if (rejecttypes.includes(data.type)) {
      toast.error("This type can't be applied");
    }

    const ref = FormExpression.create_field_property_json_ref(
      field_id,
      ...access
    );

    onChange?.(ref);
    // create a expression with path.
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
          <PropertyAccessDropdownMenu
            onSelect={onPropertySelect}
            schema={schema}
            asChild
          >
            <Button variant="outline" type="button">
              <MixIcon className="me-2" />
              {expression ? (
                <>Update Value Expression</>
              ) : (
                <>Set Value Expression</>
              )}
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
        {expression && (
          <PanelPropertyField label="Expression">
            <code>{JSON.stringify(expression, null, 2)}</code>
          </PanelPropertyField>
        )}
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}
