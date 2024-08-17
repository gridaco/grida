"use client";

import React, { useMemo, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEditorState } from "@/scaffolds/editor";
import { MixIcon } from "@radix-ui/react-icons";
import { Tokens } from "@/ast";
import { KeyIcon } from "lucide-react";
import toast from "react-hot-toast";
import { EditBinaryExpression } from "./extensions/v-edit";
import { PopoverClose } from "@radix-ui/react-popover";
import { FormExpression } from "@/lib/forms/expression";

/**
 * NOTE - the type string represents a id, not a scalar for this component, atm.
 * TODO: support scalar types
 */
type ConditionExpression = Tokens.ShorthandBooleanBinaryExpression;

export function BlockEditPanel({
  ...props
}: React.ComponentProps<typeof Sheet> & {}) {
  const [state, dispatch] = useEditorState();

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
    <Sheet
      {...props}
      open={state.is_block_edit_panel_open}
      onOpenChange={(open) => {
        if (!open) {
          dispatch({
            type: "editor/panels/block-edit",
            open: false,
          });
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{"Block"}</SheetTitle>
          <SheetDescription>
            <span className="font-mono text-xs text-muted-foreground">
              <KeyIcon className="inline w-4 h-4 me-2 align-middle" />
              {block?.id}
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <hr />
          <Label>Logics</Label>
          <hr />
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right">
              Hidden
            </Label>
            <Popover>
              <PopoverTrigger>
                <div>
                  <Button variant="outline">
                    <MixIcon className="me-2" />
                    {_v_hidden_set ? (
                      <>Update conditional logic</>
                    ) : (
                      <>Set conditional logic</>
                    )}
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
                    leftOptions={state.fields.map((f) => ({
                      type: "form_field_value",
                      identifier: f.id,
                      label: f.name,
                    }))}
                    rightOptions={(left) =>
                      state.fields
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
                </div>
              </PopoverContent>
            </Popover>
            <div className="col-span-3">
              <div className="text-muted-foreground text-sm">
                {_v_hidden_set ? (
                  <code>
                    <pre>{JSON.stringify(block?.v_hidden, null, 2)}</pre>
                  </code>
                ) : (
                  "No condition set"
                )}
              </div>
            </div>
          </div>
          {/* Add logic testing tool */}
          <hr />
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button disabled={!condition_v_hidden} onClick={onSave}>
              Save
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
