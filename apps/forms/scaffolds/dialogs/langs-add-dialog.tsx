"use client";

import React, { useCallback } from "react";
import { useEditorState } from "../editor";
import { LanguageCode } from "@/types";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LanguageSelect,
  LanguageSelectOptionMap,
} from "@/components/language-select";
import { Button } from "@/components/ui/button";

export function AddNewLanguageDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const [state, dispatch] = useEditorState();

  const { langs } = state.document.g11n;

  const [newlang, setNewLang] = React.useState<LanguageCode>();

  const onAddLang = useCallback(
    (lang: LanguageCode) => {
      dispatch({
        type: "editor/document/langs/add",
        lang,
      });
    },
    [dispatch]
  );

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogTitle>Add New Language</DialogTitle>
        <DialogDescription>Select a language to add.</DialogDescription>
        <form
          id="addnewlang"
          onSubmit={(e) => {
            e.preventDefault();
            //
            onAddLang(newlang!);
            props?.onOpenChange?.(false);
          }}
        >
          <div className="grid gap-2">
            <LanguageSelect
              required
              optionsmap={langs.reduce((acc: LanguageSelectOptionMap, l) => {
                acc[l] = { disabled: true };
                return acc;
              }, {})}
              value={newlang}
              onValueChange={setNewLang}
            />
          </div>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button form="addnewlang" type="submit">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
