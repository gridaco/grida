"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getDefaultTexts, render } from "@/lib/templating/template";
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
import { TemplateVariables } from "@/lib/templating";
import type { i18n } from "i18next";

export function TemplateEditor({
  context: _context_init,
  defaultTemplateId,
  defaultTexts,
  getComponent,
  getPropTypes,
  lang,
  t,
  onSave,
  onCancel,
}: {
  context?: Partial<TemplateVariables.FormResponseContext>;
  defaultTemplateId?: string;
  defaultTexts?: Record<string, string>;
  getComponent: (template_id: string) => React.ComponentType<any>;
  getPropTypes: (template_id: string) => z.ZodObject<any>;
  lang?: string;
  t?: i18n["t"];
  onSave?: (template_id: string, data: Record<string, string>) => void;
  onCancel?: () => void;
}) {
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "default");
  const [isModified, setIsModified] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const [props, setProps] = useState<Record<string, string>>({});
  const [discardAlertOpen, setDiscardAlertOpen] = useState(false);
  const __initial_template_id = useRef(templateId);

  const propTypes = useMemo(
    () => getPropTypes(templateId),
    [templateId, getPropTypes]
  );

  useEffect(() => {
    if (__initial_template_id.current !== templateId) {
      setIsModified(true);
    }
  }, [templateId]);

  useEffect(() => {
    const defaultTextsForTemplate = getDefaultTexts(
      propTypes.shape,
      templateId === defaultTemplateId ? defaultTexts : undefined
    );
    setProps(defaultTextsForTemplate);
  }, [propTypes, defaultTexts, templateId, defaultTemplateId]);

  useEffect(() => {
    // tell the text editor to refresh when defaultTexts or templateId changes
    setContentRefreshKey((prev) => prev + 1);
  }, [defaultTexts, templateId]);

  const onTextChange = (key: string, value: string) => {
    setProps((prev) => ({ ...prev, [key]: value }));
    setIsModified(true);
  };

  const context = useMockedContext(_context_init || {}, {
    refreshKey: String(contextRefreshKey),
    lang: lang,
  });

  const getDefaultValue = (key: string) => {
    return propTypes.shape[
      key as keyof typeof propTypes.shape
    ]._def.defaultValue();
  };

  const onReloadContextClick = () => {
    setContextRefreshKey((prev) => prev + 1);
  };

  const onSaveClick = () => {
    onSave?.(templateId, props);
    setIsModified(false);
  };

  const onCancelClick = () => {
    if (isModified) {
      setDiscardAlertOpen(true);
      return;
    }
    onCancel?.();
  };

  const texts = useMemo(() => {
    const out = Object.keys(props).reduce((acc, key) => {
      try {
        const text = props[key];
        return {
          ...acc,
          [key]: render(text, context),
        };
      } catch (e) {
        return acc;
      }
    }, {});

    return out;
  }, [props, context]);

  return (
    <main className="h-screen flex flex-col">
      <DiscardChangesAlert
        open={discardAlertOpen}
        onOpenChange={setDiscardAlertOpen}
        onDiscard={onCancel}
      />
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
                {ending_page_templates.map((id) => (
                  <SelectItem key={id} value={id}>
                    {ending_page_template_config[id].label}
                  </SelectItem>
                ))}
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
        <div className="flex-1 h-full p-4">
          <div className="h-full flex items-center justify-center">
            {React.createElement(getComponent(templateId), { ...texts })}
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
            <div>
              {Object.keys(propTypes.shape).map((key) => {
                const value =
                  props[key] !== undefined ? props[key] : getDefaultValue(key);
                return (
                  <div key={key} className="grid mb-10">
                    <Label htmlFor={key} className="mb-2">
                      {key}
                    </Label>
                    <div className="border rounded overflow-hidden">
                      <TemplateTextEditor
                        id={key}
                        value={value}
                        refreshKey={String(contentRefreshKey)}
                        plaintext={
                          common_translation_attributes[
                            key as keyof typeof common_translation_attributes
                          ]?.plaintext ?? false
                        }
                        onValueChange={(value) => {
                          console.log("onValueChange", key, value);
                          onTextChange(key, value);
                        }}
                      />
                    </div>
                    <small className="text-muted-foreground mt-2">
                      {common_translation_attributes[
                        key as keyof typeof common_translation_attributes
                      ]?.help ?? ""}
                    </small>
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

// TODO: need a smarter way
const common_translation_attributes = {
  h1: {
    plaintext: false,
    help: "heading 1",
  },
  h2: {
    plaintext: false,
    help: "heading 2",
  },
  h3: {
    plaintext: false,
    help: "heading 3",
  },
  h4: {
    plaintext: false,
    help: "heading 4",
  },
  h5: {
    plaintext: false,
    help: "heading 5",
  },
  h6: {
    plaintext: false,
    help: "heading 6",
  },
  p: {
    plaintext: false,
    help: "paragraph",
  },
  button: {
    plaintext: false,
    help: "Button text",
  },
  href: {
    plaintext: true,
    help: "Link url",
  },
} as const;

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Translation } from "@/i18n/resources";
import {
  ending_page_template_config,
  ending_page_templates,
} from "@/k/templates";

function DiscardChangesAlert({
  onDiscard,
  ...props
}: React.ComponentProps<typeof AlertDialog> & {
  onDiscard?: () => void;
}) {
  return (
    <AlertDialog {...props}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Do you really want to close this panel?
            Any changes you made will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
