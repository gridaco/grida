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
import { PopoverClose } from "@radix-ui/react-popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditorState } from "../editor";
import toast from "react-hot-toast";
import { MixIcon } from "@radix-ui/react-icons";
import { Tokens } from "@/ast";
import { KeyIcon } from "lucide-react";

/**
 * NOTE - the type string represents a id, not a scalar for this component, atm.
 * TODO: support scalar types
 */
type ConditionExpression = [
  // field id, will be used as $ref
  string,
  // operator
  Tokens.BooleanBinaryOperator,
  // option id value, will be used as scalar
  string,
];

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
      {
        $ref: `#/fields/${l}/value`,
      },
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
                <Condition
                  defaultValue={condition_v_hidden}
                  onValueCommit={(value) => {
                    set_condition_v_hidden(value);
                  }}
                />
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
            <Button onClick={onSave}>Save</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const boolean_value_operators_labels: Record<
  Tokens.BooleanBinaryOperator,
  [string, string]
> = {
  "==": ["is", "equal to"],
  "!=": ["is not", "not equal to"],
  ">": ["gt", "greater than"],
  "<": ["lt", "less than"],
  ">=": ["gte", "greater than or equal to"],
  "<=": ["lte", "less than or equal to"],
  "&&": ["and", "and"],
  "||": ["or", "or"],
};

function Condition({
  defaultValue,
  onValueCommit,
}: {
  defaultValue?: ConditionExpression;
  onValueCommit?: (value: ConditionExpression) => void;
}) {
  const [state, dispatch] = useEditorState();
  const [lefthand, setLefthand] = useState<string>();
  const [operator, setOperator] = useState<Tokens.BooleanBinaryOperator>();
  const [righthand, setRighthand] = useState<string>();

  // const block = useMemo(
  //   () => state.blocks.find((b) => b.id === state.focus_block_id),
  //   [state.blocks, state.focus_block_id]
  // );

  // block?.v_hidden;

  const lefthandField = useMemo(
    () => state.fields.find((f) => f.id === lefthand),
    [state.fields, lefthand]
  );

  const options = lefthandField?.options;

  const onDone = (e: any) => {
    // validate
    if (!lefthand || !operator || !righthand) {
      e.preventDefault();
      toast.error("Invalid Condition");
      return;
    }

    onValueCommit?.([lefthand, operator, righthand]);
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="phone" className="text-right">
          Hide Block When
        </Label>
        <Select value={lefthand} onValueChange={setLefthand}>
          <SelectTrigger>
            <SelectValue placeholder="Select Field" />
          </SelectTrigger>
          <SelectContent>
            {state.fields.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={operator}
          onValueChange={(v) => {
            setOperator(v as Tokens.BooleanBinaryOperator);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Operator" />
          </SelectTrigger>
          <SelectContent>
            {Tokens.BOOLEAN_BINARY_OPERATORS.map((op) => (
              <SelectItem key={op} value={op}>
                <code>{op}</code> {boolean_value_operators_labels[op][0]}{" "}
                <small className="text-muted-foreground">
                  ({boolean_value_operators_labels[op][1]})
                </small>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={righthand}
          onValueChange={setRighthand}
          disabled={!lefthand || !operator}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Value" />
          </SelectTrigger>
          <SelectContent>
            {options?.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <footer>
        <PopoverClose asChild>
          <Button onClick={onDone} size="sm" variant="outline">
            Done
          </Button>
        </PopoverClose>
      </footer>
    </div>
  );
}
