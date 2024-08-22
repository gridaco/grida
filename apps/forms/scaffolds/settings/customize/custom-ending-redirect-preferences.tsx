"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
  cls_input,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useForm, Controller } from "react-hook-form";
import { useEditorState } from "@/scaffolds/editor";
import { Spinner } from "@/components/spinner";
import { PrivateEditorApi } from "@/lib/private";
import toast from "react-hot-toast";

export function EndingRedirectPreferences() {
  const [state, dispatch] = useEditorState();
  const {
    form_id,
    form: { ending },
  } = state;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
    watch,
  } = useForm({
    defaultValues: {
      is_redirect_after_response_uri_enabled:
        ending.is_redirect_after_response_uri_enabled,
      redirect_after_response_uri: ending.redirect_after_response_uri,
    },
  });

  const onSubmit = async (data: {
    is_redirect_after_response_uri_enabled: boolean;
    redirect_after_response_uri: string | null;
  }) => {
    const req = PrivateEditorApi.Settings.updateFormRedirectAfterSubmission({
      form_id,
      ...data,
    });

    try {
      await toast
        .promise(req, {
          loading: "Saving...",
          success: "Saved",
          error: "Failed",
        })
        .then(() => {
          dispatch({
            type: "editor/form/ending/preferences",
            ...data,
          });
        });

      // Reset form state to the new values after successful submission
      reset(data);
    } catch (error) {}
  };

  const enabled = watch("is_redirect_after_response_uri_enabled");

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Custom Redirect URI</>} />
      <PreferenceBody>
        <form id="redirect-uri" onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center space-x-2">
              <Controller
                name="is_redirect_after_response_uri_enabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="is_redirect_after_response_uri_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="is_redirect_after_response_uri_enabled">
                {enabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
            <Controller
              name="redirect_after_response_uri"
              control={control}
              render={({ field }) => (
                <label className="flex flex-col">
                  <Input
                    name="redirect_after_response_uri"
                    type="text"
                    disabled={!enabled}
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="https://.."
                    pattern="https://.*"
                    className={cls_input}
                  />
                  <PreferenceDescription>
                    Redirect to a custom URL after form submission. Leave empty
                    for default behavior.
                  </PreferenceDescription>
                </label>
              )}
            />
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="redirect-uri"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
