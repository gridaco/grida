"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import { motion } from "framer-motion";
import { useEditorState } from "@/scaffolds/editor";
import { Button } from "@/components/ui/button";
import { useStep } from "usehooks-ts";
import { FormStartPage } from "@/theme/templates/formstart";
import { SandboxWrapper } from "./sandbox";
import { StandaloneDocumentEditor } from "@/builder";
import { grida } from "@/grida";

export function BrowseStartPageTemplatesDialog({
  defaultValue,
  onValueCommit,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  defaultValue?: string;
  onValueCommit?: (value: string) => void;
}) {
  const [state] = useEditorState();

  const {
    form: { campaign },
    theme: { lang },
  } = state;

  const [
    step,
    { goToNextStep, goToPrevStep, canGoToNextStep, canGoToPrevStep, setStep },
  ] = useStep(FormStartPage.templates.length);

  useEffect(() => {
    if (defaultValue) {
      const index = FormStartPage.templates.findIndex(
        (t) => t.name === defaultValue
      );
      setStep(index + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue]);

  useEffect(() => {
    setSelection(FormStartPage.templates[step - 1].name);
  }, [step]);

  const [selection, setSelection] = useState<string>(defaultValue ?? "003");

  const template = FormStartPage.getTemplate(selection)!;

  return (
    <Dialog {...props}>
      <DialogContent className="w-dvw h-dvh max-w-none p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 w-full relative">
          <DialogTitle>Browse Templates</DialogTitle>
          <div className="absolute top-2 flex w-full justify-center">
            <header className="flex w-min items-center justify-center gap-4 px-4 py-2 border rounded">
              <Button
                variant="ghost"
                size="icon"
                disabled={!canGoToPrevStep}
                onClick={goToPrevStep}
              >
                <ArrowLeftIcon />
              </Button>
              <h6 className="text-lg font-bold">{template.name}</h6>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canGoToNextStep}
                onClick={goToNextStep}
              >
                <ArrowRightIcon />
              </Button>
            </header>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto w-full p-4">
          {template && (
            <motion.div
              key={template.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="mx-auto max-w-screen-sm w-full h-full"
            >
              <SandboxWrapper
                className="rounded-2xl shadow-2xl w-full h-full overflow-hidden"
                onClick={() => {
                  setSelection?.(template.name);
                }}
                onDoubleClick={() => {
                  onValueCommit?.(template.name);
                }}
              >
                <StandaloneDocumentEditor
                  initial={{
                    editable: false,
                    templates: {
                      [template.name]: FormStartPage.getTemplate(template.name),
                    },
                    document: {
                      nodes: {
                        preview:
                          grida.program.nodes.createTemplateInstanceNodeFromTemplateDefinition(
                            "preview",
                            template
                          ),
                      },
                      root_id: "preview",
                    },
                  }}
                >
                  <template.component
                    // props={{
                    //   title: "",
                    // }}
                    meta={campaign}
                    lang={lang}
                  />
                </StandaloneDocumentEditor>
              </SandboxWrapper>
            </motion.div>
          )}
        </div>

        <DialogFooter className="p-4">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              disabled={!selection}
              onClick={() => {
                onValueCommit?.(selection!);
              }}
            >
              Use
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
