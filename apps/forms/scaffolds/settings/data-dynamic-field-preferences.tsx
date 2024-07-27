"use client";

import React from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormResponseUnknownFieldHandlingStrategyType } from "@/types";
import { Button } from "@/components/ui/button";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import { PrivateEditorApi } from "@/lib/private";
import { Spinner } from "@/components/spinner";
import { useEditorState } from "../editor";

export function UnknownFieldPreferences() {
  const [state] = useEditorState();
  const {
    form_id,
    form_security: { unknown_field_handling_strategy },
  } = state;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
    watch,
  } = useForm({
    defaultValues: {
      strategy: unknown_field_handling_strategy,
    },
  });

  const onSubmit = async (data: {
    strategy: FormResponseUnknownFieldHandlingStrategyType;
  }) => {
    const req = PrivateEditorApi.Settings.updateUnknownFieldsHandlingStrategy({
      form_id,
      strategy: data.strategy,
    });

    try {
      await toast.promise(req, {
        loading: "Saving...",
        success: "Settings saved",
        error: "Failed to save settings",
      });
      reset(data); // Reset form state to the new values after successful submission
    } catch (error) {}
  };

  const strategy = watch("strategy");

  return (
    <PreferenceBox>
      <PreferenceBoxHeader
        heading={<>Dynamic Fields</>}
        description={
          <>
            When a form is submitted with fields that are not defined in the
            form schema, you can choose to ignore them or store them as
            metadata.
          </>
        }
      />
      <PreferenceBody>
        <form id="unknown-fields" onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-8">
            <section>
              <div className="mt-4 flex flex-col gap-1">
                <Controller
                  name="strategy"
                  control={control}
                  render={({ field }) => (
                    <Select
                      name="unknown_field_handling_strategy"
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(
                          value as FormResponseUnknownFieldHandlingStrategyType
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accept">Accept</SelectItem>
                        <SelectItem value="ignore">Ignore</SelectItem>
                        <SelectItem value="reject">Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <PreferenceDescription>
                  {strategy_descriptions[strategy]}
                </PreferenceDescription>
              </div>
            </section>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="unknown-fields"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

const strategy_descriptions = {
  accept: "Accept form with creating new fields in schema.",
  ignore: "Accept form with ignoring unknown fields",
  reject:
    "Reject form. It will reject the request if unknown fields are found.",
} as const;
