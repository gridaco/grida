"use client";

import React, { useEffect, useMemo, useReducer, useState } from "react";
import { PanelPropertyField } from "@/components/panels/side-panel";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { LockClosedIcon, MixIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { EditValueExpression } from "./v-edit";
import PropertyAccessDropdownMenu from "@/scaffolds/sidecontrol/controls/context/variable";
import { TProperties, TProperty, TSchema } from "@/lib/spock";
import { useEditorState, useFormFields } from "@/scaffolds/editor";
import { FormExpression } from "@/lib/forms/expression";
import { toast } from "sonner";
import { tokens } from "@grida/tokens";

function useFormSchema() {
  const fields = useFormFields();

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
  expression?: tokens.TValueExpression;
  onChange?: (expression: tokens.TValueExpression) => void;
}) {
  const fields = useFormFields();
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
    <>
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
    </>
  );
}
