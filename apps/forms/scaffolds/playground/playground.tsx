"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Editor as MonacoEditor, useMonaco } from "@monaco-editor/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import {
  Link2Icon,
  ReloadIcon,
  RocketIcon,
  SlashIcon,
} from "@radix-ui/react-icons";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { examples } from "./k";
import { generate } from "@/app/actions";
import { readStreamableValue } from "ai/rsc";
import Link from "next/link";
import { useDarkMode } from "usehooks-ts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PlaygroundPreview from "./preview";
import { ThemePalette } from "../theme-editor/palette-editor";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import palettes from "@/theme/palettes";
import { useTheme } from "next-themes";
import { useMonacoTheme } from "@/components/monaco";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export function Playground({
  initial,
  defaultExample,
  onRouteChange,
}: {
  initial?: {
    src?: string;
    prompt?: string;
    slug?: string;
  };
  defaultExample?: string;
  onRouteChange?: (route: string) => void;
}) {
  const generating = useRef(false);
  const router = useRouter();

  const [fileName, setFileName] = useState<EditorFileName>("form.json");

  // const [is_modified, set_is_modified] = useState(false);
  const [exampleId, setExampleId] = useState<string | undefined>(
    initial ? undefined : defaultExample ?? examples[0].id
  );
  // const [data, setData] = useState<JSONForm | undefined>();
  const [__schema_txt, __set_schema_txt] = useState<string | null>(
    initial?.src || null
  );

  const [theme_preset, set_theme_preset] = useState<string>("blue");
  const [theme, set_theme] = useState(
    // @ts-ignore
    palettes[theme_preset]
  );
  const [__variablecss_txt, __set_variablecss_txt] = useState<string | null>(
    stringfyThemeVariables(theme)
  );

  useEffect(() => {
    set_theme(
      // @ts-ignore
      palettes[theme_preset]
    );
  }, [theme_preset]);

  useEffect(() => {
    __set_variablecss_txt(stringfyThemeVariables(theme));
  }, [theme]);

  const [__customcss_txt, __set_customcss_txt] = useState<string>("");

  const [dark, setDark] = useState(false);

  const is_modified = __schema_txt !== initial?.src;
  const [busy, setBusy] = useState(false);

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
      // fetch and set the example schema
      fetch(examples.find((e) => e.id === exampleId)!.template.schema.src)
        .then((res) => res.text())
        .then((schema) => {
          __set_schema_txt(schema);
        });
    }
  }, [exampleId]);

  useEffect(() => {
    // update the url
    onRouteChange?.(`/playground?example=${exampleId}`);
  }, [exampleId, onRouteChange]);

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
            <div className="relative flex-shrink flex flex-col h-full">
              {fileName === "variables.css" && (
                <div className="absolute z-20 top-16 right-4 max-w-lg">
                  <ThemePalette
                    preset={theme_preset}
                    onPresetChange={set_theme_preset}
                    value={theme}
                    onValueChange={set_theme}
                    onDarkChange={setDark}
                  />
                </div>
              )}
              <Editor
                readonly={busy}
                fileName={fileName}
                onFileNameChange={setFileName}
                files={{
                  "form.json": {
                    name: "form.json",
                    language: "json",
                    value: __schema_txt || "",
                  },
                  "variables.css": {
                    name: "variables.css",
                    language: "css",
                    value: __variablecss_txt || "",
                  },
                  "custom.css": {
                    name: "custom.css",
                    language: "css",
                    value: __customcss_txt || "",
                  },
                }}
                onChange={(f: EditorFileName, v?: string) => {
                  switch (f) {
                    case "form.json": {
                      __set_schema_txt(v || "");
                      return;
                    }
                    case "variables.css": {
                      __set_variablecss_txt(v || "");
                      return;
                    }
                    case "custom.css": {
                      __set_customcss_txt(v || "");
                    }
                  }
                }}
              />
            </div>
          </div>
        </section>
        <div className="h-full border-r" />
        <section className="flex-1 h-full overflow-y-scroll">
          <PlaygroundPreview
            schema={__schema_txt || ""}
            css={(__variablecss_txt || "") + "\n" + (__customcss_txt || "")}
            dark={dark}
          />
        </section>
      </div>
    </main>
  );
}

const schema = {
  uri: "https://forms.grida.co/schema/form.schema.json",
  fileMatch: ["*"], // Associate with all JSON files
};

type EditorFileName =
  | "form.json"
  // | "theme.json"
  | "variables.css"
  | "custom.css";
type EditorFile<T extends EditorFileName = any> = {
  name: EditorFileName;
  language: "json" | "css";
  value?: string;
};
type EditorFiles = {
  "form.json": EditorFile<"form.json">;
  "variables.css": EditorFile<"variables.css">;
  // "theme.json": EditorFile<"theme.json">;
  "custom.css": EditorFile<"custom.css">;
};

function Editor({
  fileName,
  onFileNameChange,
  files,
  onChange,
  readonly,
}: {
  // value?: string;
  fileName: EditorFileName;
  onFileNameChange?: (fileName: EditorFileName) => void;
  files: EditorFiles;
  onChange?: (fileName: EditorFileName, value?: string) => void;
  readonly?: boolean;
}) {
  const file = files[fileName];

  const monaco = useMonaco();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    monaco?.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: true,
      schemas: [schema],
    });
  }, [monaco]);

  useMonacoTheme(monaco, resolvedTheme ?? "light");

  return (
    <div className="font-mono flex-1 flex flex-col w-full h-full">
      <header className="p-2 border-b z-10">
        <Tabs
          value={fileName}
          onValueChange={(file) => {
            onFileNameChange?.(file as EditorFileName);
          }}
        >
          <TabsList>
            {Object.keys(files).map((file) => (
              <TabsTrigger key={file} value={file}>
                {file}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>
      <div className="relative w-full h-full">
        <MonacoEditor
          height={"100%"}
          onChange={(v, ev) => {
            if (ev.isFlush) {
              return;
            }
            onChange?.(fileName, v);
          }}
          path={fileName}
          defaultLanguage={file.language}
          defaultValue={file.value}
          value={file.value}
          options={{
            readOnly: readonly || fileName === "variables.css",
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
    </div>
  );
}
