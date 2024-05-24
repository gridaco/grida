"use client";
import { useEffect, useMemo, useState } from "react";
import { render } from "@/lib/templating/template";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { z } from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CaretLeftIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import resources from "@/i18n";
import { useMockedContext } from "@/scaffolds/template-editor/mock";
import { TemplateTextEditor } from "@/scaffolds/template-editor/text-editor";
import { ContextVariablesTable } from "@/scaffolds/template-editor/about-variable-table";

export default function TemplatingDevPage() {
  const [isModified, setIsModified] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [texts, setTexts] = useState<Record<string, string>>({
    h1: ExamplePropsZ.shape.h1._def.defaultValue(),
    h2: ExamplePropsZ.shape.h2._def.defaultValue(),
    p: ExamplePropsZ.shape.p._def.defaultValue(),
  });

  const onTextChange = (key: string, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
    setIsModified(true);
  };

  const context = useMockedContext(
    {
      title: "Form Title",
    },
    {
      refreshKey: String(contextRefreshKey),
      lang: "en",
    }
  );

  const onReloadContextClick = () => {
    setContextRefreshKey((prev) => prev + 1);
  };

  const out = useMemo(() => {
    const out = Object.keys(texts).reduce((acc, key) => {
      try {
        const text = texts[key];
        return {
          ...acc,
          [key]: render(text, context),
        };
      } catch (e) {
        return acc;
      }
    }, {});

    return out;
  }, [texts, context]);

  return (
    <main className="h-screen flex flex-col">
      <header className="border-b p-4">
        <div className="flex w-full justify-between">
          <div className="flex-1 flex gap-4">
            <Button size="icon" variant="outline">
              <CaretLeftIcon />
            </Button>
            <Select>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="example 1">Example 1</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <h1 className="text-md font-bold">Customize Ending Page</h1>
          </div>
          <div className="flex-1 flex justify-end gap-2">
            <Button variant="secondary">Cancel</Button>
            <Button
              disabled={!isModified}
              onClick={() => {
                console.log("save");
                setIsModified(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </header>
      <div className="h-full flex overflow-hidden">
        {/*  */}

        {/*  */}
        <div className="flex-1 h-full p-4">
          <div className="h-full flex items-center justify-center">
            {/* @ts-ignore */}
            <Example {...out} />
          </div>
        </div>
        <aside className="border-s flex-1 h-full max-w-md overflow-y-scroll">
          <div className="p-4 flex flex-col gap-10">
            <header>
              <h2 className="text-lg font-bold">Text Templates</h2>
              <article className="prose dark:prose-invert prose-sm">
                <p className="mt-2">
                  Customize template contents with your own. you can still use
                  variables like <code>form_title</code>,{" "}
                  <code>response.idx</code>, etc. Use <code>{"{{...}}"}</code>{" "}
                  to wrap a variable.
                </p>
                <section className="font-mono">
                  <Collapsible>
                    <CollapsibleTrigger>
                      <HoverCard>
                        <HoverCardTrigger>
                          <Badge variant="secondary">
                            context: formcomplete
                          </Badge>
                        </HoverCardTrigger>
                        <HoverCardContent>
                          <div className="text-left">
                            <h6 className="text-md font-bold">formcomplete</h6>
                            <p>
                              <code>formcomplete</code> is a context where the
                              form is submitted and processed. this context
                              includes information about the form, response, and
                              customer.
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4">
                      <Tabs defaultValue="variables">
                        <TabsList>
                          <TabsTrigger value="variables">Variables</TabsTrigger>
                          <TabsTrigger value="data">Test Data</TabsTrigger>
                        </TabsList>
                        <TabsContent value="variables">
                          <ContextVariablesTable />
                        </TabsContent>
                        <TabsContent value="data" className="relative">
                          <header className="absolute right-4 top-4">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={onReloadContextClick}
                            >
                              <ReloadIcon />
                            </Button>
                          </header>
                          <pre>
                            <code>{JSON.stringify(context, null, 2)}</code>
                          </pre>
                        </TabsContent>
                      </Tabs>
                    </CollapsibleContent>
                  </Collapsible>
                </section>
              </article>
            </header>
            <div>
              {Object.keys(ExamplePropsZ.shape).map((key) => {
                const defaultValue =
                  ExamplePropsZ.shape[
                    key as keyof typeof ExamplePropsZ.shape
                  ]._def.defaultValue();
                return (
                  <div key={key} className="grid mb-10">
                    <Label htmlFor={key} className="mb-2">
                      {key}
                    </Label>
                    <div className="border rounded overflow-hidden">
                      <TemplateTextEditor
                        id={key}
                        defaultValue={defaultValue}
                        onValueChange={(html) => {
                          onTextChange(key, html);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

const ExamplePropsZ = z.object({
  h1: z.string().default("{{response.idx}}"),
  h2: z
    .string()
    .default(resources.en.translation["formcomplete"]["receipt01"]["title"]),
  p: z
    .string()
    .default(
      resources.en.translation["formcomplete"]["receipt01"]["description"]
    ),
});

function Example({ h1, h2, p }: { h1: string; h2: string; p: string }) {
  return (
    <Card className="w-full max-w-md p-4">
      <CardHeader className="flex flex-col items-center">
        <div
          id="h1"
          className="text-5xl font-black text-blue-700 mb-4"
          dangerouslySetInnerHTML={{ __html: h1 }}
        />
        <h2
          id="h2"
          className="text-lg text-center font-bold tracking-tight"
          dangerouslySetInnerHTML={{ __html: h2 }}
        />
      </CardHeader>
      <CardContent className="p-0">
        <p
          id="p"
          className="text-sm text-center text-gray-500"
          dangerouslySetInnerHTML={{ __html: p }}
        />
      </CardContent>
      {/* <CardFooter className="flex w-full p-0"></CardFooter> */}
    </Card>
  );
}
