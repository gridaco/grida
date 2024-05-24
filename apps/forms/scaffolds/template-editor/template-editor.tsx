"use client";

import React, { useEffect, useMemo, useState } from "react";
import { render } from "@/lib/templating/template";
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
import { useMockedContext } from "@/scaffolds/template-editor/mock";
import { TemplateTextEditor } from "@/scaffolds/template-editor/text-editor";
import { ContextVariablesTable } from "@/scaffolds/template-editor/about-variable-table";

export function TemplateEditor({
  defaultTemplateId,
  defaultTexts,
  getComponent,
  getPropTypes,
  lang,
  onSave,
  onCancel,
}: {
  defaultTemplateId?: string;
  defaultTexts?: Record<string, string>;
  getComponent: (template_id: string) => React.ComponentType<any>;
  getPropTypes: (template_id: string) => z.ZodObject<any>;
  lang?: string;
  onSave?: (data: Record<string, string>) => void;
  onCancel?: () => void;
}) {
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "default");
  const [isModified, setIsModified] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [texts, setTexts] = useState<Record<string, string>>(
    defaultTexts ?? {}
  );

  const propTypes = useMemo(
    () => getPropTypes(templateId),
    [templateId, getPropTypes]
  );

  useEffect(() => {
    const defaults = Object.keys(propTypes.shape).reduce(
      (acc: typeof propTypes.shape, key) => {
        return {
          ...acc,
          [key]:
            propTypes.shape[
              key as keyof typeof propTypes.shape
              // @ts-ignore
            ]._def.defaultValue(),
        };
      },
      {}
    );

    setTexts(defaults);
  }, [propTypes]);

  const onTextChange = (key: string, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
    setIsModified(true);
  };

  const context = useMockedContext(
    {
      title: undefined,
    },
    {
      refreshKey: String(contextRefreshKey),
      lang: lang,
    }
  );

  const onReloadContextClick = () => {
    setContextRefreshKey((prev) => prev + 1);
  };

  const onSaveClick = () => {
    onSave?.(texts);
    setIsModified(false);
  };

  const onCancelClick = () => {
    onCancel?.();
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
            <Button size="icon" variant="outline" onClick={onCancelClick}>
              <CaretLeftIcon />
            </Button>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">default</SelectItem>
                <SelectItem value="receipt01">receipt01</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <h1 className="text-md font-bold">Customize Ending Page</h1>
          </div>
          <div className="flex-1 flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancelClick}>
              Cancel
            </Button>
            <Button disabled={!isModified} onClick={onSaveClick}>
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
            {React.createElement(
              // @ts-ignore
              getComponent(templateId),
              { ...out }
            )}
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
            <hr />
            <div key={templateId}>
              {Object.keys(propTypes.shape).map((key) => {
                const defaultValue =
                  propTypes.shape[
                    key as keyof typeof propTypes.shape
                    // @ts-ignore
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

export function getPropTypes(t: Record<string, string>) {
  return z.object(
    Object.keys(t).reduce((acc, key) => {
      return {
        ...acc,
        [key]: z.string().default(t[key]),
      };
    }, {})
  );
}
