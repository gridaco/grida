"use client";

import React, { useEffect, useState } from "react";
import {
  PanelPropertyField,
  PanelPropertyFields,
  PanelPropertySection,
  PanelPropertySectionTitle,
  PropertyTextInput,
} from "@/components/panels/side-panel";
import { type FormFieldStorageSchema, GridaSupabase } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEditorState } from "@/scaffolds/editor";
import { SupabaseLogo } from "@/components/logos";
import { Spinner } from "@/components/spinner";
import { PrivateEditorApi } from "@/lib/private";
import { ContextVariablesTable } from "@/scaffolds/template-editor/about-variable-table";

export function SupabaseStorageSettings({
  value,
  onValueChange,
  enabled,
  onEnabledChange,
  rules,
}: {
  value?: Partial<FormFieldStorageSchema> | null | undefined;
  onValueChange?: (value: Partial<FormFieldStorageSchema>) => void;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  rules: {
    pathpolicy:
      | "x-supabase-storage-compile-time-renderable-single-file-path-template"
      | undefined;
    bucketpolicy: "public" | "private" | "any";
  };
}) {
  const [state] = useEditorState();
  const [buckets, setBuckets] = useState<GridaSupabase.SupabaseBucket[]>();
  const [bucket, setBucket] = useState<string | undefined>(value?.bucket);
  const [path, setPath] = useState<string | undefined>(value?.path);
  const [mode, setMode] = useState<FormFieldStorageSchema["mode"]>(
    value?.mode ?? "direct"
  );

  useEffect(() => {
    // check if path contains template

    onValueChange?.({
      type: "x-supabase",
      bucket,
      mode: isHandlebarTemplate(path) ? "staged" : mode,
      path,
    });
  }, [enabled, bucket, mode, path, onValueChange]);

  // list buckets
  useEffect(() => {
    if (!state.connections.supabase) return;
    if (enabled) {
      PrivateEditorApi.SupabaseConnection.listBucket(
        state.connections.supabase.id
      ).then((res) => {
        res.data.data && setBuckets(res.data.data);
      });
    }
  }, [enabled, state.form_id, state.connections.supabase]);

  useEffect(() => {
    setBucket(value?.bucket);
    setMode(value?.mode ?? "direct");
    setPath(value?.path);
  }, [value]);

  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>
        <SupabaseLogo className="inline me-2 w-5 h-5 align-middle" />
        Supabase Storage
      </PanelPropertySectionTitle>
      <PanelPropertyFields>
        <PanelPropertyField
          label={"Enable Storage"}
          description="Enable Supabase Storage to store files in your Supabase project. (Required)"
        >
          <Switch
            // IMPORTANT: the custom storage is required since we do not provide a alternate cdn solution. built in storage works only with a 'response' model, where we can't enforce this on x-supabase connection.
            required
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        </PanelPropertyField>
        {enabled && (
          <>
            <PanelPropertyField
              label={"Bucket"}
              description="The bucket name to upload the file to."
              help={
                rules.bucketpolicy === "public" && (
                  <>
                    Public bucket is required for this field.
                    <br />
                    <br />
                    <i>List of types required for public bucket:</i>
                    <ul>
                      <li>
                        <code>richtext</code>
                      </li>
                    </ul>
                  </>
                )
              }
            >
              {buckets ? (
                <>
                  <Select
                    required
                    value={bucket}
                    onValueChange={(value) => setBucket(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {buckets?.map((bucket) => (
                        <SelectItem
                          key={bucket.id}
                          value={bucket.id}
                          disabled={!validatebucket(bucket, rules.bucketpolicy)}
                        >
                          <span>
                            {bucket.name}
                            <small className="ms-2 text-muted-foreground">
                              {bucket.public ? "public" : "private"}
                            </small>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <Select required disabled>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          <div className="flex gap-2">
                            <Spinner /> Loading...
                          </div>
                        }
                      />
                    </SelectTrigger>
                  </Select>
                </>
              )}
            </PanelPropertyField>
            <PanelPropertyField
              label={"Upload Path"}
              description="The file upload path. (Leave leading and trailing slashes off)"
              help={
                <>
                  <ContextVariablesTable schema="x-supabase.postgrest_query_insert_select" />
                </>
              }
            >
              <PropertyTextInput
                placeholder="public/{{RECORD.id}}/photos/{{file.name}}"
                value={path}
                required
                pattern="^(?!\/).*"
                onChange={(e) => setPath(e.target.value)}
              />
            </PanelPropertyField>
            <PanelPropertyField
              label={"Staged Uploading"}
              help={
                <>
                  Staged uploading allows you to upload first under{" "}
                  <code>tmp/[session]/</code>
                  folder and then move to the final destination. This is useful
                  when you want to upload files under <code>path/to/[id]/</code>
                  and you don&apos;t have the <code>id</code> yet.
                </>
              }
              description={
                <>
                  Use staged uploading to upload first, then move to final path
                  once transaction is complete.
                </>
              }
            >
              <Switch
                checked={mode === "staged"}
                onCheckedChange={(checked) =>
                  setMode(checked ? "staged" : "direct")
                }
              />
            </PanelPropertyField>
          </>
        )}
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}

function isHandlebarTemplate(str?: string) {
  if (!str) return false;
  const handlebarRegex = /\{\{[^{}]*\}\}/;
  return handlebarRegex.test(str);
}

function validatebucket(
  bucket: { public: boolean },
  policy: "public" | "private" | "any"
): boolean {
  if (policy === "private") return !bucket.public;
  if (policy === "public") return bucket.public;
  return true;
}
