"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tokens } from "@/ast";
import { binary_operator_labels } from "@/ast/k";
import { Label } from "@/components/ui/label";

type Identifier = string;

type PrimaryPropertyReferenceProps<T extends string = string> = {
  type: "number" | "string" | "boolean" | T;
  identifier: Identifier;
  label: string;
};

export function EditValueExpression() {
  return <></>;
}

export function EditBinaryExpression<
  ResolvedType extends "boolean" | "number" | "string",
>({
  defaultValue,
  onValueChange,
  leftOptions,
  resolvedType,
  rightOptions: resolveRightOptions,
}: {
  resolvedType: ResolvedType;
  defaultValue?: Tokens.ShorthandBinaryExpression;
  leftOptions: Array<PrimaryPropertyReferenceProps>;
  rightOptions: // | Array<PropertyReferenceProps>
  (
    left: Identifier,
    op?: Tokens.BinaryOperator
  ) => Array<PrimaryPropertyReferenceProps> | undefined;
  onValueChange?: (
    value: ResolvedType extends "boolean"
      ? Tokens.ShorthandBooleanBinaryExpression
      : Tokens.ShorthandBinaryExpression
  ) => void;
}) {
  const [lefthand, setLefthand] = useState<string>();
  const [operator, setOperator] = useState<Tokens.BooleanBinaryOperator>();
  const [righthand, setRighthand] = useState<string>();

  const rightOptions = useMemo(() => {
    if (!lefthand) {
      return undefined;
    }

    return resolveRightOptions(lefthand, operator);
  }, [lefthand, operator]);

  useEffect(() => {
    // validate
    if (!lefthand || !operator || !righthand) {
      return;
    }

    // when valid, notify
    onValueChange?.([lefthand, operator, righthand]);
  }, [lefthand, operator, righthand]);

  return (
    <div className="grid grid-cols-3 items-center gap-4">
      <Select value={lefthand} onValueChange={setLefthand}>
        <SelectTrigger>
          <SelectValue placeholder="Select Field" />
        </SelectTrigger>
        <SelectContent>
          {leftOptions.map((f) => (
            <SelectItem key={f.identifier} value={f.identifier}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        disabled={!lefthand}
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
              <code>{op}</code> {binary_operator_labels[op][0]}{" "}
              <small className="text-muted-foreground">
                ({binary_operator_labels[op][1]})
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
          {rightOptions?.length ? (
            <>
              {rightOptions.map((r) => (
                <SelectItem key={r.identifier} value={r.identifier}>
                  {r.label}
                </SelectItem>
              ))}
            </>
          ) : (
            <div className="p-4 space-y-2">
              <Label>No available option.</Label>
              <br />
              <p className="text-muted-foreground text-xs max-w-xs">
                No matching options found for the selected field. You can try
                selecting a different field or operator.
              </p>
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
