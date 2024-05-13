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
import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  JSONField,
  JSONForm,
  JSONOptionLike,
  parse,
  parse_jsonfield_type,
} from "@/types/schema";
import resources from "@/k/i18n";
import { FormRenderTree } from "@/lib/forms";
import { GridaLogo } from "@/components/grida-logo";
import { FormFieldAutocompleteType, Option } from "@/types";
import { Button } from "@/components/ui/button";
import { Link2Icon, RocketIcon, SlashIcon } from "@radix-ui/react-icons";
import { createClientFormsClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { examples } from "./k";
import { generate } from "@/app/actions";
import { readStreamableValue } from "ai/rsc";
import Link from "next/link";
import { useDarkMode } from "usehooks-ts";

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
    schema.title,
    schema.description,
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

export function Playground({
  initial,
}: {
  initial?: {
    src?: string;
    prompt?: string;
    slug?: string;
  };
}) {
  const generating = useRef(false);
  const router = useRouter();

  // const [is_modified, set_is_modified] = useState(false);
  const [exampleId, setExampleId] = useState<string | undefined>(
    initial ? undefined : examples[0].id
  );
  // const [data, setData] = useState<JSONForm | undefined>();
  const [__schema_txt, __set_schema_txt] = useState<string | null>(
    initial?.src || null
  );

  const is_modified = __schema_txt !== initial?.src;
  const [busy, setBusy] = useState(false);

  const renderer: FormRenderTree | undefined = useMemo(
    () => (__schema_txt ? compile(__schema_txt) : undefined),
    [__schema_txt]
  );

  useEffect(() => {
    if (initial?.prompt) {
      if (generating.current) {
        return;
      }

      setBusy(true);
      generating.current = true;
      generate(initial.prompt).then(async ({ output }) => {
        for await (const delta of readStreamableValue(output)) {
          // setData(delta as JSONForm);
          __set_schema_txt(JSON.stringify(delta, null, 2));
        }
        generating.current = false;
        setBusy(false);
        // TODO: update gist with new schema generated to prevent re-generation on refresh
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (exampleId) {
      fetch(examples.find((e) => e.id === exampleId)!.template.schema.src)
        .then((res) => res.text())
        .then((schema) => {
          __set_schema_txt(schema);
        });
    }
  }, [exampleId]);

  const onShare = async () => {
    setBusy(true);
    fetch("/playground/share", {
      method: "POST",
      body: JSON.stringify({
        src: __schema_txt,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((req) => req.json())
      .then(({ slug }) => {
        // update the route
        router.push(`/playground/${slug}`);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to share");
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main className="w-screen h-screen flex flex-col overflow-hidden">
      <header className="p-4 flex justify-between border-b">
        <div className="flex gap-1 items-center">
          <Link href="/ai">
            <button className="text-md font-black text-start flex items-center gap-2">
              <GridaLogo />
              <span className="flex flex-col">
                Forms
                <span className="-mt-1 font-mono font-normal text-[10px]">
                  Playground
                </span>
              </span>
            </button>
          </Link>
          <SlashIcon className="h-6 w-6 opacity-20" />
          <div className="ms-1">
            <Select
              disabled={busy}
              value={exampleId}
              onValueChange={(value) => setExampleId(value)}
            >
              <SelectTrigger id="method" aria-label="select method">
                <SelectValue placeholder="Examples" />
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
          {initial?.slug && !is_modified && (
            <Button variant="link">../{initial.slug}</Button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <Button
            onClick={onShare}
            disabled={!is_modified || busy}
            variant="secondary"
          >
            <Link2Icon className="mr-2" />
            Share
          </Button>
          <Button disabled={busy}>
            <RocketIcon className="mr-2" />
            Publlish
          </Button>
        </div>
      </header>
      <div className="flex-1 flex max-h-full overflow-hidden">
        <section className="flex-1 h-full">
          <div className="w-full h-full flex flex-col">
            <div className="flex-shrink flex flex-col h-full">
              <Editor
                readonly={busy}
                value={__schema_txt || ""}
                onChange={(v?: string) => {
                  __set_schema_txt(v || "");
                }}
              />
            </div>
            {/* <div className="flex-grow">
              <details>
                <summary>Data</summary>
                <MonacoEditor
                  height={200}
                  defaultLanguage="json"
                  value={JSON.stringify(renderer, null, 2)}
                  options={{
                    padding: {
                      top: 16,
                    },
                    minimap: {
                      enabled: false,
                    },
                    scrollBeyondLastLine: false,
                  }}
                />
              </details>
            </div> */}
          </div>
        </section>
        <div className="h-full border-r" />
        <section className="flex-1 h-full overflow-y-scroll">
          {renderer ? (
            <div className="flex flex-col items-center w-full">
              {(renderer.title || renderer.description) && (
                <div className="mt-10 text-start w-full prose dark:prose-invert p-4">
                  <h1>{renderer.title}</h1>
                  <p>{renderer.description}</p>
                  <hr />
                </div>
              )}
              <FormView
                title={"Form"}
                form_id={renderer.id}
                fields={renderer.fields()}
                blocks={renderer.blocks()}
                tree={renderer.tree()}
                translation={resources.en.translation as any}
                options={{
                  is_powered_by_branding_enabled: true,
                }}
              />
            </div>
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
  readonly,
}: {
  value?: string;
  onChange?: (value?: string) => void;
  readonly?: boolean;
}) {
  const monaco = useMonaco();
  const { isDarkMode } = useDarkMode();

  useEffect(() => {
    monaco?.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: true,
      schemas: [schema],
    });

    import("monaco-themes/themes/Blackboard.json").then((data) => {
      data.colors["editor.background"] = "#030711";
      monaco?.editor.defineTheme("dark", data as any);
      monaco?.editor.setTheme(isDarkMode ? "dark" : "light");
    });
  }, [monaco]);

  return (
    <div className="font-mono flex-1 flex flex-col w-full h-full">
      <header className="p-2 border-b">
        <span className="text-sm opacity-80">form.json</span>
      </header>
      <MonacoEditor
        height={"100%"}
        defaultLanguage="json"
        onChange={onChange}
        value={value}
        theme={isDarkMode ? "dark" : "light"}
        options={{
          readOnly: readonly,
          automaticLayout: true,
          padding: {
            top: 16,
          },
          minimap: {
            enabled: false,
          },
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}
