"use client";

import { useMemo, useState } from "react";
import { generate } from "@/app/actions";
import { readStreamableValue } from "ai/rsc";
import { FormRenderTree } from "@/lib/forms";
import { nanoid } from "nanoid";
import {
  JSONField,
  JSONForm,
  JSONOptionLike,
  parse,
  parse_jsonfield_type,
} from "@/types/schema";
import { FormFieldAutocompleteType, Option } from "@/types";
import { FormView } from "@/scaffolds/e/form";
import resources from "@/k/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Editor as MonacoEditor, useMonaco } from "@monaco-editor/react";
import { Metadata } from "next";

type MaybeArray<T> = T | T[];

// export const metadata: Metadata = {
//   title: "AI Forms Builder",
//   description: "AI Forms Builder",
// };

function toArrayOf<T>(value: MaybeArray<T>, nofalsy = true): NonNullable<T>[] {
  return (
    Array.isArray(value) ? value : nofalsy && value ? [value] : []
  ) as NonNullable<T>[];
}

function compile(value?: string | object) {
  const schema = parse(value);
  if (!schema) {
    return;
  }

  const map_option = (o: JSONOptionLike): Option => {
    switch (typeof o) {
      case "string":
      case "number": {
        return {
          id: String(o),
          value: String(o),
          label: String(o),
        };
      }
      case "object": {
        return {
          ...o,
          id: o.value,
        };
      }
    }
  };

  const renderer = new FormRenderTree(
    nanoid(),
    schema.fields?.map((f: JSONField, i) => {
      const { type, is_array } = parse_jsonfield_type(f.type);
      return {
        ...f,
        id: f.name,
        type: type,
        is_array,
        autocomplete: toArrayOf<FormFieldAutocompleteType | undefined>(
          f.autocomplete
        ),
        required: f.required || false,
        local_index: i,
        options: f.options?.map(map_option) || [],
      };
    }) || [],
    []
  );

  return renderer;
}

export default function Playground() {
  const [data, setData] = useState<JSONForm | undefined>();

  const renderer: FormRenderTree | undefined = useMemo(
    () => compile(data),
    [data]
  );

  return (
    <main className="flex w-screen h-screen p-10">
      <div className="h-full flex-1">
        <Prompt
          onSubmit={async (input) => {
            const { output } = await generate(input);

            for await (const delta of readStreamableValue(output)) {
              setData(delta as JSONForm);
            }
          }}
        />
      </div>
      {data && (
        <>
          {renderer ? (
            <FormView
              title={"Form"}
              form_id={renderer.id}
              fields={renderer.fields()}
              blocks={renderer.blocks()}
              tree={renderer.tree()}
              translation={resources.en.translation as any}
              options={{
                is_powered_by_branding_enabled: false,
              }}
            />
          ) : (
            <div className="grow flex items-center justify-center p-4 text-center text-gray-500">
              Invalid schema
            </div>
          )}
        </>
      )}
    </main>
  );
}

export function Prompt({ onSubmit }: { onSubmit?: (input: string) => void }) {
  const [input, setInput] = useState<string>("");

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Build Forms with AI</h2>
        <p className="text-gray-500 dark:text-gray-400">
          Enter your AI prompt and let the magic happen.
        </p>
      </div>
      <form className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="prompt">Your Prompt</Label>
          <Textarea
            className="min-h-[100px]"
            id="prompt"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter your AI prompt here..."
          />
        </div>
        <Button
          onClick={(e) => {
            e.preventDefault();
            onSubmit?.(input);
          }}
          className="w-full"
          type="submit"
        >
          Generate
        </Button>
      </form>
    </div>
  );
}
