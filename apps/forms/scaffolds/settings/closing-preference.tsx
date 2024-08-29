"use client";

import React from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PrivateEditorApi } from "@/lib/private";
import toast from "react-hot-toast";
import { useForm, Controller } from "react-hook-form";
import { Spinner } from "@/components/spinner";
import { useEditorState } from "@/scaffolds/editor";

export function ClosingFormPreferences() {
  const [state, dispatch] = useEditorState();
  const { form, campaign } = state;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
  } = useForm({
    defaultValues: {
      is_force_closed: campaign.is_force_closed,
    },
  });

  const onSubmit = async (data: { is_force_closed: boolean }) => {
    const req = PrivateEditorApi.Settings.updateFormAccessForceClose({
      form_id: form.form_id,
      closed: data.is_force_closed,
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
            type: "editor/form/campaign/preferences",
            is_force_closed: data.is_force_closed,
          });
        });

      // Reset form state to the new values after successful submission
      reset(data);
    } catch (error) {}
  };

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Close Form</>} />
      <PreferenceBody>
        <form id="force-close-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center space-x-2">
            <Controller
              name="is_force_closed"
              control={control}
              render={({ field }) => (
                <Switch
                  id="is_force_closed"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="is_force_closed">Force-Close this Form</Label>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="force-close-form"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}
