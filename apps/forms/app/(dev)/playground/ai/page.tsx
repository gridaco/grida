"use client";

import { useMemo, useState } from "react";
import { generate } from "../actions";
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
import { Editor as MonacoEditor, useMonaco } from "@monaco-editor/react";

type MaybeArray<T> = T | T[];

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

export default function Home() {
  const [data, setData] = useState<JSONForm | undefined>();
  const [input, setInput] = useState<string>("");

  const renderer: FormRenderTree | undefined = useMemo(
    () => compile(data),
    [data]
  );

  return (
    <main className="flex w-screen h-screen p-10">
      <div className="h-full flex-1">
        <div className="h-full">
          {/* {conversation.map((val: any, i: number) => (
          <div key={i}>{val}</div>
        ))} */}
          <MonacoEditor
            height="100%"
            language="json"
            value={JSON.stringify(data, null, 2)}
            options={{
              minimap: {
                enabled: false,
              },
            }}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex gap-4 p-4 z-10 bg-white">
          <Textarea
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
            }}
          />
          <Button
            onClick={async () => {
              const { output } = await generate(input);

              for await (const delta of readStreamableValue(output)) {
                setData(delta as JSONForm);
              }
            }}
          >
            Generate
          </Button>
        </div>
      </div>
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
    </main>
  );
}
