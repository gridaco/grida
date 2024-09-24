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
import { XSBSQLForeignKeySearchInput } from "./sql-fk-search-input";

export function SQLLiteralInput({
  value,
  onValueChange,
  config = { type: "text" },
  autoFocus,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  config?: GridaXSupabaseTypeMap.SQLLiteralInputConfig;
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
        <Select value={value || undefined} onValueChange={onValueChange}>
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
        <Select value={value || undefined} onValueChange={onValueChange}>
          <SelectTrigger autoFocus={autoFocus}>
            <SelectValue placeholder={"Select a value..."} />
          </SelectTrigger>
          <SelectContent>
            {config.accepts_boolean && (
              <>
                <SelectItem value="true">
                  <CheckboxIcon className="inline-flex align-middle w-4 h-4 me-1" />
                  true
                </SelectItem>
                <SelectItem value="false">
                  <BoxIcon className="inline-flex align-middle w-4 h-4 me-1" />
                  false
                </SelectItem>
              </>
            )}
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
    case "search":
      return (
        <XSBSQLForeignKeySearchInput
          value={value}
          onValueChange={onValueChange}
          relation={config.relation}
          // TODO:
          // xsb project id
          supabase_project_id={0}
          // same schema
          supabase_schema_name={""}
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
