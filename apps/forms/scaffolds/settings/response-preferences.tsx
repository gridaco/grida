"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import { PrivateEditorApi } from "@/lib/private";
import { Spinner } from "@/components/spinner";
import { editorlink } from "@/lib/forms/url";
import { useEditorState } from "../editor";

export function RestrictNumberOfResponseByCustomer() {
  const [state, dispatch] = useEditorState();

  const { form_id, campaign } = state;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
    watch,
  } = useForm({
    defaultValues: {
      enabled: campaign.is_max_form_responses_by_customer_enabled,
      max: campaign.max_form_responses_by_customer || 1,
    },
  });

  const onSubmit = async (data: { enabled: boolean; max: number }) => {
    const req =
      PrivateEditorApi.Settings.updateFormAccessMaxResponsesByCustomer({
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
            type: "editor/form/campaign/preferences",
            is_max_form_responses_by_customer_enabled: data.enabled,
            max_form_responses_by_customer: data.max,
          });
        });
      reset(data); // Reset form state to the new values after successful submission
    } catch (error) {}
  };

  const enabled = watch("enabled");
  const n = watch("max");

  return (
    <PreferenceBox>
      <PreferenceBoxHeader
        heading={<>Limit number of responses by customer</>}
        description={<MaxResponsesByCustomerHelpWarning />}
      />
      <PreferenceBody>
        <form id="max-responses-by-customer" onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center space-x-2">
              <Controller
                name="enabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="max-responses-by-customer-enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="max-responses-by-customer-enabled">
                {enabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
            <div className={clsx(!enabled && "hidden")}>
              <Controller
                name="max"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={1}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            {enabled && n ? (
              <PreferenceDescription>
                Limit to {n} {txt_response_plural(n)} per user.
                <>{n === 1 && <> {txt_no_multiple_response_description}</>}</>
              </PreferenceDescription>
            ) : (
              <PreferenceDescription>
                Users can submit an unlimited number of responses.
              </PreferenceDescription>
            )}
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="max-responses-by-customer"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

function MaxResponsesByCustomerHelpWarning() {
  const [state] = useEditorState();

  const { form_id, basepath } = state;

  return (
    <>
      Make sure you have{" "}
      <Link
        href={editorlink("connect/customer", {
          basepath,
          form_id,
        })}
      >
        <u>customer identity</u>
      </Link>{" "}
      configured or login page enabled.
      <br />
      Otherwise this feature may not work as intended.{" "}
      <HoverCard>
        <HoverCardTrigger>
          <u>
            <InfoCircledIcon className="inline me-0.5 align-middle" />
            Lean more
          </u>
        </HoverCardTrigger>
        <HoverCardContent>
          <article className="prose prose-sm dark:prose-invert">
            Fingerprint generation for some platform/environment may confict
            customer identity, thus this feature may not work as intended.
            <br />
            <br />
            <strong>Vunarable platforms:</strong>
            <ul>
              <li>
                <a href="https://fingerprint.com/blog/ios15-icloud-private-relay-vulnerability/">
                  iOS 15+ with iCloud Private Relay
                </a>
              </li>
              <li>iOS / Android Webviews</li>
            </ul>
            Please note that setting up customer identity or having a login page
            will resolve this issue.
          </article>
        </HoverCardContent>
      </HoverCard>
      <br />
    </>
  );
}

export function MaxRespoonses() {
  const [state, dispatch] = useEditorState();

  const { form_id, campaign } = state;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
    watch,
  } = useForm({
    defaultValues: {
      enabled: campaign.is_max_form_responses_in_total_enabled,
      max: campaign.max_form_responses_in_total || 100,
    },
  });

  const onSubmit = async (data: { enabled: boolean; max: number }) => {
    const req = PrivateEditorApi.Settings.updateFormAccessMaxResponsesInTotal({
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
            type: "editor/form/campaign/preferences",
            is_max_form_responses_in_total_enabled: data.enabled,
            max_form_responses_in_total: data.max,
          });
        });
      reset(data); // Reset form state to the new values after successful submission
    } catch (error) {}
  };

  const enabled = watch("enabled");

  return (
    <PreferenceBox>
      <PreferenceBoxHeader
        heading={<>Limit number of total responses</>}
        description={
          <>
            Set maximum number of responses allowed. This is useful when you
            have limited number of offers, inventory, or tickets.
          </>
        }
      />
      <PreferenceBody>
        <form id="max-responses-in-total" onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <Controller
                name="enabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="max-responses-in-total-enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="max-responses-in-total-enabled">
                {enabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
            <div className={!enabled ? "hidden" : ""}>
              <label className="flex flex-col gap-2 cursor-pointer">
                <PreferenceDescription>
                  Maximum number of responses allowed
                </PreferenceDescription>
                <Controller
                  name="max"
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="number"
                      placeholder="Leave empty for unlimited responses"
                      min={1}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </label>
            </div>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="max-responses-in-total"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

const txt_no_multiple_response_description =
  "Users won't be able to submit multiple responses.";

const txt_response_plural = (n: number) => {
  return n === 1 ? "response" : "responses";
};
