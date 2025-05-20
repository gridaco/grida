"use client";

import React, { useCallback } from "react";
import {
  PanelPropertyField,
  PanelPropertyFields,
  PanelPropertySection,
  PanelPropertySectionTitle,
} from "@/components/panels/side-panel";
import { GridaXSupabase } from "@/types";
import type { FormFieldReferenceSchema } from "@/grida-forms/hosted/types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEditorState } from "@/scaffolds/editor";
import { SupabaseLogo } from "@/components/logos";

export function SupabaseFKReferenceSettings({
  readonly,
  format,
  value,
  onValueChange,
  enabled,
  onEnabledChange,
}: {
  /**
   * Readonly is used when relation is set by the system and should not be changed by the user.
   */
  readonly?: boolean;
  format?: string;
  value?: Partial<FormFieldReferenceSchema> | null | undefined;
  onValueChange?: (value: Partial<FormFieldReferenceSchema>) => void;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const [state] = useEditorState();

  const { supabase_project } = state;

  const { schema, table, column } = value || {};

  const onTableChange = useCallback(
    (table: string) => {
      const [schema, _table] = table.split(".");

      onValueChange?.({
        type: "x-supabase",
        schema,
        table: _table,
        column: undefined,
      });
    },
    [onValueChange]
  );

  const onColumnCahnge = useCallback(
    (column: string) => {
      onValueChange?.({
        type: "x-supabase",
        schema,
        table,
        column,
      });
    },
    [onValueChange, schema, table]
  );

  const fulltable = (schema && table && `${schema}.${table}`) || undefined;

  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>
        <SupabaseLogo className="inline me-2 size-5 align-middle" />
        Supabase Foreign Key
      </PanelPropertySectionTitle>
      <PanelPropertyFields>
        <PanelPropertyField
          label={"Enable Foreign Key Search"}
          description="Enable Supabase Foreign Key Search to reference data from your Supabase project."
        >
          <Switch
            disabled={readonly}
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        </PanelPropertyField>
        {enabled && (
          <>
            <PanelPropertyField
              label={"Reference Table"}
              description="The table to reference data from."
            >
              <Select
                disabled={readonly}
                value={fulltable}
                onValueChange={onTableChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder={"Select Table"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectSeparator />
                    <SelectLabel>auth</SelectLabel>
                    <SelectItem value="auth.users">
                      <span>auth.users</span>
                    </SelectItem>
                  </SelectGroup>
                  {Object.keys(supabase_project!.sb_schema_definitions).map(
                    (schemaName) => {
                      return (
                        <SelectGroup key={schemaName}>
                          <SelectSeparator />
                          <SelectLabel>{schemaName}</SelectLabel>
                          {Object.keys(
                            supabase_project!.sb_schema_definitions[schemaName]
                          ).map((tableName) => {
                            const fulltable = `${schemaName}.${tableName}`;
                            return (
                              <SelectItem key={fulltable} value={fulltable}>
                                <span>{fulltable}</span>
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      );
                    }
                  )}
                </SelectContent>
              </Select>
            </PanelPropertyField>
            {fulltable && (
              <PanelPropertyField
                label={"Column"}
                description="The column to reference data from."
              >
                <Select
                  disabled={readonly}
                  value={column || undefined}
                  onValueChange={onColumnCahnge}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={"Select Column"} />
                  </SelectTrigger>
                  <SelectContent>
                    {schema &&
                      table &&
                      (schema === "auth" && table === "users" ? (
                        <>
                          {Object.keys(
                            GridaXSupabase.SupabaseUserJsonSchema.properties
                          ).map((key) => {
                            const property =
                              GridaXSupabase.SupabaseUserJsonSchema.properties[
                                key as GridaXSupabase.SupabaseUserColumn
                              ];
                            return (
                              <SelectItem
                                disabled={
                                  format ? format !== property.format : false
                                }
                                key={key}
                                value={key}
                              >
                                <span>{key}</span>{" "}
                                <small className="ms-1 text-muted-foreground">
                                  {property.type} | {property.format}
                                </small>
                              </SelectItem>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          {Object.keys(
                            supabase_project!.sb_schema_definitions[schema][
                              table
                            ]?.properties ?? {}
                          )?.map((key) => {
                            const property =
                              supabase_project!.sb_schema_definitions[schema][
                                table
                              ].properties?.[key];
                            return (
                              <SelectItem
                                disabled={
                                  format ? format !== property.format : false
                                }
                                key={key}
                                value={key}
                              >
                                <span>{key}</span>{" "}
                                <small className="ms-1 text-muted-foreground">
                                  {property.type} | {property.format}
                                </small>
                              </SelectItem>
                            );
                          })}
                        </>
                      ))}
                  </SelectContent>
                </Select>
              </PanelPropertyField>
            )}
          </>
        )}
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}
