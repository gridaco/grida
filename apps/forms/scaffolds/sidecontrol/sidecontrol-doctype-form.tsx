import React, { useMemo, useState } from "react";
import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { SideControlGlobal } from "./sidecontrol-global";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEditorState, useFormFields } from "@/scaffolds/editor";
import { MixIcon } from "@radix-ui/react-icons";
import { Tokens } from "@/ast";
import { KeyIcon } from "lucide-react";
import toast from "react-hot-toast";
import { FormExpression } from "@/lib/forms/expression";
import { PropertyLine, PropertyLineLabel } from "./ui";
import { EditBinaryExpression } from "../panels/extensions/v-edit";
import { PopoverClose } from "@radix-ui/react-popover";

export function SideControlDoctypeForm() {
  const [state, dispatch] = useEditorState();

  if (state.focus_block_id) {
    return <SelectedFormBlockProperties />;
  } else {
    return <SideControlGlobal />;
  }
}

/**
 * NOTE - the type string represents a id, not a scalar for this component, atm.
 * TODO: support scalar types
 */
type ConditionExpression = Tokens.ShorthandBooleanBinaryExpression;

function SelectedFormBlockProperties() {
  //
  const [state, dispatch] = useEditorState();
  const fields = useFormFields();

  const block = useMemo(
    () => state.blocks.find((b) => b.id === state.focus_block_id),
    [state.blocks, state.focus_block_id]
  );

  const [condition_v_hidden, set_condition_v_hidden] =
    useState<ConditionExpression>();

  // console.log("block?.v_hidden", block?.v_hidden);

  const _v_hidden_set = !!block?.v_hidden;

  const onSave = (e: any) => {
    const [l, op, r] = condition_v_hidden || [];

    if (!l || !op || !r) {
      e.preventDefault();
      toast.error("Invalid Condition");
      return;
    }
    //
    const exp: Tokens.ShorthandBooleanBinaryExpression = [
      FormExpression.create_field_property_json_ref(l as string, "value"),
      op,
      r,
    ];

    //
    dispatch({
      type: "blocks/hidden",
      block_id: block!.id,
      v_hidden: exp,
    });
  };

  return (
    <div key={state.focus_block_id}>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Block</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Hidden</PropertyLineLabel>
            <Popover>
              <PopoverTrigger>
                <div>
                  <Button variant="outline">
                    <MixIcon className="me-2" />
                    {_v_hidden_set ? <>Update</> : <>Set logic</>}
                  </Button>
                </div>
              </PopoverTrigger>
              <PopoverContent collisionPadding={16} className="w-full">
                <div className="flex gap-4">
                  <Label htmlFor="phone" className="text-right">
                    Block is hidden when <br />
                    <code className="text-muted-foreground">
                      block.hidden ={" "}
                    </code>
                  </Label>
                  <EditBinaryExpression
                    resolvedType="boolean"
                    leftOptions={fields.map((f) => ({
                      type: "form_field_value",
                      identifier: f.id,
                      label: f.name,
                    }))}
                    rightOptions={(left) =>
                      fields
                        .find((f) => f.id === left)
                        ?.options?.map((o) => ({
                          type: "option_value_reference",
                          identifier: o.id,
                          label: o.label || o.value,
                        }))
                    }
                    defaultValue={condition_v_hidden}
                    onValueChange={(value) => {
                      set_condition_v_hidden(value);
                    }}
                  />
                  <PopoverClose asChild>
                    <Button disabled={!condition_v_hidden} onClick={onSave}>
                      Save
                    </Button>
                  </PopoverClose>
                </div>
              </PopoverContent>
            </Popover>
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>

      {/* <div className="text-muted-foreground text-sm">
        {_v_hidden_set ? (
          <code>
            <pre>{JSON.stringify(block?.v_hidden, null, 2)}</pre>
          </code>
        ) : (
          "No condition set"
        )}
      </div> */}
    </div>
  );
}
