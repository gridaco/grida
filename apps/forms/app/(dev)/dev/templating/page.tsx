"use client";
import { TemplateVariables } from "@/lib/templating";
import { Editor } from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { faker } from "@faker-js/faker";
import { fmt_local_index } from "@/utils/fmt";
import { template } from "@/lib/templating/template";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

function fake() {
  const response_index = faker.number.int(50);
  const context: TemplateVariables.FormResponseContext = {
    customer: {
      short_id: faker.string.uuid(),
    },
    form_title: "Buy me a coffee",
    title: "Buy me a coffee",
    fields: {},
    language: "en",
    response: {
      index: response_index,
      idx: fmt_local_index(response_index),
    },
    session: {},
  };

  return context;
}

const init = `{{!-- use double lines to separate h1, h2, p --}}
{{response.idx}}

{{form_title}} - Thank you for your order.

Your Message
`;

export default function TemplatingDevPage() {
  const [source, setSource] = useState<string>(init);
  const context = useMemo(() => fake(), []);

  const out = useMemo(() => {
    try {
      return template(source, context);
    } catch (e) {
      return "";
    }
  }, [source, context]);

  const [h1, h2, p] = useMemo(() => {
    const splits = out.split("\n\n");
    const h1 = splits[0];
    const h2 = splits[1];
    const p = splits[2];

    return [h1, h2, p];
  }, [out]);
  return (
    <main className="h-screen flex">
      {/*  */}
      <aside className="flex-1 h-full">
        <Editor
          height="100%"
          defaultLanguage="handlebars"
          defaultValue={init}
          value={source}
          onChange={(value) => setSource(value ?? "")}
          options={{
            padding: {
              top: 16,
            },
          }}
        />
      </aside>
      {/*  */}
      <aside className="flex-1 h-full p-4 overflow-scroll">
        <article className="mx-auto flex items-center justify-center py-10">
          <Example h1={h1} h2={h2} p={p} />
        </article>
        <hr className="py-4" />
        <section>
          <small>
            <pre>
              <code>{JSON.stringify(context, null, 2)}</code>
            </pre>
          </small>
        </section>
        <hr className="py-4" />
        <section>
          <small>
            <pre>
              <code>{out}</code>
            </pre>
          </small>
        </section>
        <hr className="py-4" />
      </aside>
    </main>
  );
}

function Example({ h1, h2, p }: { h1: string; h2: string; p: string }) {
  return (
    <Card className="w-full max-w-md p-4">
      <CardHeader className="flex flex-col items-center">
        <div className="text-5xl font-black text-blue-700 mb-4">{h1}</div>
        <h2 className="text-lg text-center font-bold tracking-tight">{h2}</h2>
      </CardHeader>
      <CardContent className="p-0">
        <p className="text-sm text-center text-gray-500">{p}</p>
      </CardContent>
      {/* <CardFooter className="flex w-full p-0"></CardFooter> */}
    </Card>
  );
}
