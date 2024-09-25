"use client";
//
import React, { useCallback, useEffect } from "react";
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
import { GridaXSupabaseTypeMap } from "@/lib/x-supabase/typemap";
import { XSBSQLForeignKeySearchInput } from "./xsb-sql-fk-search-input";

export type SQLLiteralInputValue =
  | string
  | number
  | "true"
  | "false"
  | "null"
  | "not null"
  | undefined;

export function XSBSQLLiteralInput({
  value,
  onValueChange,
  config = { type: "text" },
  supabase,
  autoFocus,
}: {
  value?: SQLLiteralInputValue;
  onValueChange?: (value: SQLLiteralInputValue) => void;
  config?: GridaXSupabaseTypeMap.SQLLiteralInputConfig;
  supabase: {
    supabase_project_id: number;
    supabase_schema_name: string;
  };
  autoFocus?: boolean;
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
          <SelectTrigger autoFocus={autoFocus}>
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
          <SelectTrigger autoFocus={autoFocus}>
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
            <SelectItem value="not null">
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
          <SelectTrigger>
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
        <XSBSQLForeignKeySearchInput
          value={value}
          onValueChange={(value) => onValueChange?.(value)}
          relation={config.relation}
          supabase_project_id={supabase.supabase_project_id}
          supabase_schema_name={supabase.supabase_schema_name}
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
