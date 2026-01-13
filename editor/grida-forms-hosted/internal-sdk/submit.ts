"use client";

import { Env } from "@/env";
import type { EditorApiResponse } from "@/types/private/api";

/**
 * Minimal, stable shape from `POST /v1/submit/:form_id` JSON response.
 *
 * The endpoint returns a full `response` row as `data`, but most callers only
 * need `customer_id`.
 */
export type DefaultFormSubmitResponseData = {
  customer_id?: string | null;
  [key: string]: unknown;
};

export type DefaultFormSubmitResponse<
  TData extends DefaultFormSubmitResponseData = DefaultFormSubmitResponseData,
> = EditorApiResponse<TData, unknown>;

/**
 * Submits a form to the default Grida forms endpoint (`/v1/submit/:form_id`)
 * and returns the JSON response.
 */
export async function submitFormToDefaultEndpoint<
  TData extends DefaultFormSubmitResponseData = DefaultFormSubmitResponseData,
>(
  form_id: string,
  formdata: FormData,
  opts?: {
    /**
     * Defaults to `Env.web.HOST`.
     *
     * Useful for running in non-standard hosts (e.g. simulator environments).
     */
    host?: string;
    signal?: AbortSignal;
  }
): Promise<DefaultFormSubmitResponse<TData>> {
  const host = opts?.host ?? Env.web.HOST;

  const res = await fetch(`${host}/v1/submit/${form_id}`, {
    method: "POST",
    body: formdata,
    signal: opts?.signal,
    headers: {
      accept: "application/json",
    },
  });

  return (await res.json()) as DefaultFormSubmitResponse<TData>;
}

/**
 * A small helper to build a submit handler that:
 * - Prevents default form submission
 * - Posts to `/v1/submit/:form_id`
 * - Calls caller-provided callbacks
 */
export function createDefaultFormSubmitHandler<
  TData extends DefaultFormSubmitResponseData = DefaultFormSubmitResponseData,
>(args: {
  form_id: string;
  onSuccess?: (ctx: { data: TData }) => void | Promise<void>;
  onError?: (ctx: {
    error: unknown;
    response: DefaultFormSubmitResponse<TData>;
  }) => void | Promise<void>;
  host?: string;
}) {
  return async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formdata = new FormData(e.target as HTMLFormElement);
    const response = await submitFormToDefaultEndpoint<TData>(
      args.form_id,
      formdata,
      { host: args.host }
    );

    if (!response?.data) {
      await args.onError?.({ error: response?.error, response });
      return;
    }

    await args.onSuccess?.({ data: response.data });
  };
}
