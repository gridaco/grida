"use client";

import React, { useState } from "react";
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
import { Button } from "@/components/ui/button";
import type { FormMethod } from "@/types";

export function FormMethodPreference({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    method: FormMethod;
  };
}) {
  const [method, setMethod] = useState<FormMethod>(init.method);

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
        <form
          id="/private/editor/settings/form-method"
          action="/private/editor/settings/form-method"
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex flex-col gap-8">
            <section>
              <div className="mt-4 flex flex-col gap-1">
                <Select
                  name="method"
                  value={method}
                  onValueChange={(value) => {
                    setMethod(value as any);
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
                <article className="my-2 prose prose-sm dark:prose-invert">
                  {method_descriptions[method]}
                </article>
              </div>
            </section>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/settings/form-method" type="submit">
          Save
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
