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
  json_form_field_to_form_field_definition,
  parse,
  parse_jsonfield_type,
} from "@/types/schema";
import resources from "@/k/i18n";
import { FormRenderTree } from "@/lib/forms";
import { GridaLogo } from "@/components/grida-logo";
import { FormFieldAutocompleteType, Option } from "@/types";
import { Button } from "@/components/ui/button";
import {
  ExclamationTriangleIcon,
  Link2Icon,
  ReloadIcon,
  RocketIcon,
  SlashIcon,
} from "@radix-ui/react-icons";
import { createClientFormsClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { examples } from "./k";
import { generate } from "@/app/actions";
import { readStreamableValue } from "ai/rsc";
import Link from "next/link";
import { useDarkMode } from "usehooks-ts";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

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

  const renderer = new FormRenderTree(
    nanoid(),
    schema.title,
    schema.description,
    json_form_field_to_form_field_definition(schema.fields),
    [],
    {
      blocks: {
        when_empty: {
          header: {
            title_and_description: {
              enabled: true,
            },
          },
        },
      },
    }
  );

  return renderer;
}

function useRenderer(raw?: string | object | null) {
  // use last valid schema
  const [valid, setValid] = useState<FormRenderTree>();
  const [invalid, setInvalid] = useState<boolean>(false);

  useEffect(() => {
    if (raw) {
      const o = compile(raw);
      if (o) {
        setValid(o);
        setInvalid(false);
      } else {
        setInvalid(true);
      }
    }
  }, [raw]);

  return [valid, invalid] as const;
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

  const [renderer, invalid] = useRenderer(__schema_txt);

  const streamGeneration = (prompt: string) => {
    if (generating.current) {
      return;
    }

    setBusy(true);
    generating.current = true;
    generate(prompt, initial?.slug).then(async ({ output }) => {
      for await (const delta of readStreamableValue(output)) {
        // setData(delta as JSONForm);
        __set_schema_txt(JSON.stringify(delta, null, 2));
      }
      generating.current = false;
      setBusy(false);
    });
  };

  useEffect(() => {
    if (initial?.prompt && !initial?.src) {
      streamGeneration(initial.prompt);
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

  const onShareClick = async () => {
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

  const onPublishClick = async () => {
    setBusy(true);
    fetch("/playground/publish", {
      method: "POST",
      body: JSON.stringify({
        src: __schema_txt,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <header className="relative p-4 flex justify-between border-b">
        {/* {busy && (
          <div className="absolute inset-0 flex items-center justify-center">
            
          </div>
        )} */}
        <div className="flex-1  flex gap-1 items-center">
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
            <Button
              onClick={() => {
                // copy to clipboard
                navigator.clipboard.writeText(
                  `${HOST_NAME}/playground/${initial.slug}`
                );
                toast.success("Copied");
              }}
              variant="link"
            >
              ../{initial.slug}
            </Button>
          )}
        </div>
        <div className="flex-1 flex justify-center">
          {busy ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 border-2 border-t-[#333] rounded-full animate-spin" />
              <span className="text-sm opacity-80">Generating...</span>
            </div>
          ) : (
            <>
              {initial?.prompt ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      streamGeneration(initial.prompt!);
                    }}
                  >
                    <ReloadIcon />
                  </Button>
                </>
              ) : (
                <></>
              )}
            </>
          )}
        </div>
        <div className="flex-1 flex gap-2 items-center justify-end">
          <Button
            onClick={onShareClick}
            disabled={!is_modified || busy}
            variant="secondary"
          >
            <Link2Icon className="mr-2" />
            Share
          </Button>
          <form action={`/playground/publish`} method="POST">
            <input type="hidden" name="src" value={__schema_txt || undefined} />
            <input type="hidden" name="gist" value={initial?.slug} />
            <Button disabled={busy}>
              <RocketIcon className="mr-2" />
              Publish
            </Button>
          </form>
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
            <div className="relative flex flex-col items-center w-full">
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
              {invalid && (
                <div className="absolute top-2 right-2 bg-red-500 p-2 rounded shadow">
                  <ExclamationTriangleIcon />
                </div>
              )}
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
      data.colors["editor.background"] = "#0D0D0D";
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
