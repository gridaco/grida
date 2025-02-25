"use client";

import React from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import { PrivateEditorApi } from "@/lib/private";
import { FormMethod } from "@/types";
import { Spinner } from "@/components/spinner";
import { useEditorState } from "../editor";

export function FormMethodPreference() {
  const [state] = useEditorState();
  const {
    form,
    form: { form_security: initial },
  } = state;
  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
    watch,
  } = useForm({
    defaultValues: {
      method: initial.method,
    },
  });

  const onSubmit = async (data: { method: FormMethod }) => {
    const req = PrivateEditorApi.Settings.updateFormMethod({
      form_id: form.form_id,
      ...data,
    });

    try {
      await toast.promise(req, {
        loading: "Saving...",
        success: "Saved",
        error: "Failed",
      });
      reset(data); // Reset form state to the new values after successful submission
    } catch (error) {}
  };

  const method = watch("method");

  return (
    <PreferenceBox>
      <PreferenceBoxHeader
        heading={<>Method</>}
        description={
          <>
            The HTTP method to submit the form with. The only allowed
            methods/values are: <code>post</code>, <code>get</code>.
          </>
        }
      />
      <PreferenceBody>
        <form id="form-method" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-8">
            <section>
              <div className="mt-4 flex flex-col gap-1">
                <Controller
                  name="method"
                  control={control}
                  render={({ field }) => (
                    <Select
                      name="method"
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value as FormMethod);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="post">post</SelectItem>
                        <SelectItem value="get">get</SelectItem>
                        <SelectItem value="dialog" disabled>
                          dialog (not supported)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <article className="my-2 prose prose-sm dark:prose-invert">
                  {method_descriptions[method]}
                </article>
              </div>
            </section>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="form-method"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

const method_descriptions = {
  get: (
    <>
      <p className="opacity-50">
        The{" "}
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/GET"
          target="_blank"
        >
          GET
        </a>
        ; form data appended to the action URL with a ? separator. Use this
        method when the form has no{" "}
        <a
          href="https://developer.mozilla.org/en-US/docs/Glossary/Idempotent"
          target="_blank"
        >
          side effects
        </a>
        .
      </p>
      <hr />
      <strong>Not Recommended:</strong> Do not use GET if,
      <ul>
        <li>the form is submitting sensitive information</li>
        <li>the form is submitting a large amount of data</li>
        <li>the form has file input(s)</li>
      </ul>
    </>
  ),
  post: (
    <>
      <p className="opacity-50">
        The{" "}
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/POST"
          target="_blank"
        >
          POST
        </a>{" "}
        method; form data sent as the{" "}
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/API/Request/body"
          target="_blank"
        >
          request body
        </a>
        .
      </p>
    </>
  ),
  dialog: "Not supported",
} as const;
