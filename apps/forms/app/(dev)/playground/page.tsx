"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormView } from "@/scaffolds/e/form";
import { Editor as MonacoEditor, useMonaco } from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
  JSONField,
  JSONForm,
  JSONOptionLike,
  parse,
  parse_jsonfield_type,
} from "@/types/schema";
import resources from "@/k/i18n";
import { FormRenderer } from "@/lib/forms";
import { GridaLogo } from "@/components/grida-logo";
import { FormFieldAutocompleteType, Option } from "@/types";
import Ajv from "ajv";

const HOST = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

const examples = [
  {
    id: "001-hello-world",
    name: "Hello World",
    template: {
      schema: {
        src: `${HOST}/schema/examples/001-hello-world/form.json`,
      },
    },
  },
  {
    id: "002-iphone-pre-order",
    name: "iPhone Pre-Order",
    template: {
      schema: {
        src: `${HOST}/schema/examples/002-iphone-pre-order/form.json`,
      },
    },
  },
  {
    id: "003-fields",
    name: "Fields",
    template: {
      schema: {
        src: `${HOST}/schema/examples/003-fields/form.json`,
      },
    },
  },
] as const;

type MaybeArray<T> = T | T[];

function toArrayOf<T>(value: MaybeArray<T>, nofalsy = true): NonNullable<T>[] {
  return (
    Array.isArray(value) ? value : nofalsy && value ? [value] : []
  ) as NonNullable<T>[];
}

function compile(txt?: string) {
  const schema = parse(txt);
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

  const renderer = new FormRenderer(
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

export default function FormsPlayground() {
  const [action, setAction] = useState<string>("");
  const [method, setMethod] = useState<string>("get");
  const [exampleId, setExampleId] = useState<string>(examples[0].id);
  const [__schema_txt, __set_schema_txt] = useState<string | undefined>();

  const renderer: FormRenderer | undefined = useMemo(
    () => compile(__schema_txt),
    [__schema_txt]
  );

  useEffect(() => {
    if (exampleId) {
      fetch(examples.find((e) => e.id === exampleId)!.template.schema.src)
        .then((res) => res.text())
        .then((schema) => {
          __set_schema_txt(schema);
        });
    }
  }, [exampleId]);

  return (
    <main className="w-screen h-screen flex flex-col overflow-hidden">
      <header className="p-4 flex justify-between">
        <div className="flex gap-4">
          <h1 className="text-xl font-black flex items-center gap-2">
            <GridaLogo />
            Forms
            <span className="font-mono text-sm px-3 py-1 rounded-md bg-black/45 text-white">
              Playground
            </span>
          </h1>
          <div className="ms-10">
            <Select
              value={exampleId}
              onValueChange={(value) => setExampleId(value)}
            >
              <SelectTrigger id="method" aria-label="select method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {examples.map((example) => (
                  <SelectItem key={example.id} value={example.id}>
                    {example.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>
      <div className="flex-1 flex h-full">
        <section className="flex-1 h-full">
          <div className="w-full h-full p-4">
            <div className="w-full h-full rounded-md overflow-hidden shadow">
              <Editor value={__schema_txt} onChange={__set_schema_txt} />
            </div>
            <details className="bg-white absolute bottom-0 left-0 max-h-96 overflow-scroll z-10">
              <summary>Renderer JSON</summary>
              <pre>
                <code>{JSON.stringify(renderer, null, 2)}</code>
              </pre>
            </details>
          </div>
        </section>
        <section className="flex-1 flex h-full overflow-y-scroll">
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
        </section>
      </div>
    </main>
  );
}

const schema = {
  uri: "https://forms.grida.co/schema/form.schema.json",
  fileMatch: ["*"], // Associate with all JSON files
};

function Editor({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (value?: string) => void;
}) {
  const monaco = useMonaco();

  useEffect(() => {
    monaco?.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: true,
      schemas: [schema],
    });
  }, [monaco]);

  return (
    <div className="font-mono flex-1 flex flex-col w-full h-full">
      <header className="p-2">
        <h2 className="">form.json</h2>
      </header>
      <MonacoEditor
        height={"100%"}
        defaultLanguage="json"
        onChange={onChange}
        value={value}
        options={{
          padding: {
            top: 16,
          },
          minimap: {
            enabled: false,
          },
        }}
      />
    </div>
  );
}
