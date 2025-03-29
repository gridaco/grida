"use client";

import React from "react";
import {
  BoxIcon,
  CheckboxIcon,
  ValueIcon,
  ValueNoneIcon,
} from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PostgresTypeTools } from "@/lib/x-supabase/typemap";
import type { SQLLiteralInputValue } from "./types";
import type { Data } from "@/lib/data";

export function SQLLiteralInput({
  value,
  onValueChange,
  config = { type: "text" },
  autoFocus,
  components = {
    fksearch: () => <></>,
  },
}: {
  value?: SQLLiteralInputValue;
  onValueChange?: (value: SQLLiteralInputValue) => void;
  config?: PostgresTypeTools.SQLLiteralInputConfig;
  autoFocus?: boolean;
  components?: {
    fksearch: React.ComponentType<{
      value: SQLLiteralInputValue;
      onValueChange: (value: SQLLiteralInputValue) => void;
      relation: Data.Relation.NonCompositeRelationship;
      className?: string;
    }>;
  };
}) {
  switch (config?.type) {
    case "text":
    case "datetime-local":
    case "date":
    case "number":
    case "time":
      return (
        <Input
          type={config.type}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Type a value..."
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={WorkbenchUI.inputVariants({
            variant: "input",
            size: "sm",
          })}
        />
      );
    case "boolean":
      return (
        <Select
          value={(value as string) || undefined}
          onValueChange={onValueChange}
        >
          <SelectTrigger
            autoFocus={autoFocus}
            className={WorkbenchUI.selectVariants({
              variant: "trigger",
              size: "sm",
            })}
          >
            <SelectValue placeholder={"Select a value..."} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">
              <CheckboxIcon className="inline-flex align-middle w-4 h-4 me-1" />
              true
            </SelectItem>
            <SelectItem value="false">
              <BoxIcon className="inline-flex align-middle w-4 h-4 me-1" />
              false
            </SelectItem>
          </SelectContent>
        </Select>
      );
    case "is":
      return (
        <Select
          value={(value as string) || undefined}
          onValueChange={onValueChange}
        >
          <SelectTrigger
            autoFocus={autoFocus}
            className={WorkbenchUI.selectVariants({
              variant: "trigger",
              size: "sm",
            })}
          >
            <SelectValue placeholder={"Select a value..."} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true" disabled={!config.accepts_boolean}>
              <CheckboxIcon className="inline-flex align-middle w-4 h-4 me-1" />
              true
            </SelectItem>
            <SelectItem value="false" disabled={!config.accepts_boolean}>
              <BoxIcon className="inline-flex align-middle w-4 h-4 me-1" />
              false
            </SelectItem>
            <SelectItem value="null">
              <ValueNoneIcon className="inline-flex align-middle w-4 h-4 me-1" />
              null
            </SelectItem>
            {/* https://github.com/PostgREST/postgrest/issues/3747 */}
            <SelectItem
              value="not null"
              // TODO: should be done with negate
              disabled
            >
              <ValueIcon className="inline-flex align-middle w-4 h-4 me-1" />
              not null
            </SelectItem>
          </SelectContent>
        </Select>
      );
    case "select":
      const { options } = config;
      return (
        <Select
          value={(value as string) || undefined}
          onValueChange={onValueChange}
        >
          <SelectTrigger
            className={WorkbenchUI.selectVariants({
              variant: "trigger",
              size: "sm",
            })}
          >
            <SelectValue placeholder="Select a enum..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "search":
      return (
        <components.fksearch
          value={value}
          onValueChange={(value) => onValueChange?.(value)}
          relation={config.relation}
          className={WorkbenchUI.inputVariants({
            variant: "input",
            size: "sm",
          })}
        />
      );
    case "json":
    case "xml":
    default:
      return (
        <Input
          type="search"
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Type a value..."
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          className={WorkbenchUI.inputVariants({
            variant: "input",
            size: "sm",
          })}
        />
      );
      break;
  }
}
