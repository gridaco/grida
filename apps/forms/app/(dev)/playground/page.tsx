"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormView } from "@/scaffolds/e/form";
import { Editor, useMonaco } from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { JSONForm } from "@/types/schema";
import resources from "@/k/i18n";
import Ajv from "ajv";
import { FormRenderer } from "@/lib/forms";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function parse(txt?: string): JSONForm | null {
  try {
    return txt ? JSON.parse(txt) : null;
  } catch (error) {
    return null;
  }
}

function compile(txt?: string) {
  const schema = parse(txt);
  if (!schema) {
    return;
  }

  const renderer = new FormRenderer(
    nanoid(),
    schema.fields?.map((f, i) => ({
      ...f,
      id: f.name,
      required: f.required || false,
      local_index: i,
      options:
        f.options?.map((o) => ({
          ...o,
          id: o.value,
        })) || [],
    })) || [],
    []
  );

  return renderer;
}

export default function FormsPlayground() {
  const [action, setAction] = useState<string>("");
  const [method, setMethod] = useState<string>("get");
  const [__schema_txt, __set_schema_txt] = useState<string | undefined>();

  const renderer: FormRenderer | undefined = useMemo(
    () => compile(__schema_txt),
    [__schema_txt]
  );

  return (
    <main className="w-screen h-screen flex overflow-hidden">
      <section className="flex-1">
        <header className="p-2">
          <h1 className="text-xl font-bold">Grida Forms Playground</h1>
        </header>
        <FormJsonEditor onChange={__set_schema_txt} />
        <details className="absolute bottom-0 left-0 max-h-96 overflow-scroll">
          <summary>Renderer JSON</summary>
          <pre>
            <code>{JSON.stringify(renderer, null, 2)}</code>
          </pre>
        </details>
      </section>
      <section className="flex-1">
        <div className="px-4">
          <header className="py-4 flex flex-col">
            <div className="flex items-end gap-2">
              <Label>
                Method
                <Select
                  value={method}
                  onValueChange={(value) => setMethod(value)}
                >
                  <SelectTrigger id="method" aria-label="select method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="get">GET</SelectItem>
                    <SelectItem value="post">POST</SelectItem>
                    <SelectItem value="put">PUT</SelectItem>
                    <SelectItem value="delete">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Label>
                Action
                <Input
                  type="text"
                  placeholder="https://forms.grida.co/submit/..."
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                />
              </Label>
              <Button>Submit</Button>
            </div>
          </header>
          <div className="rounded-lg shadow-md border-dashed">
            {renderer && (
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
            )}
          </div>
          <form action={action} method={method}>
            {/*  */}
          </form>
        </div>
      </section>
    </main>
  );
}

const schema = {
  uri: "https://forms.grida.co/schema/form.schema.json",
  fileMatch: ["*"], // Associate with all JSON files
};

function FormJsonEditor({ onChange }: { onChange?: (value?: string) => void }) {
  const monaco = useMonaco();

  useEffect(() => {
    monaco?.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: true,
      schemas: [schema],
    });
  }, [monaco]);

  return <Editor height={"100%"} defaultLanguage="json" onChange={onChange} />;
}
