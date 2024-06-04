"use client";

import { useEditorState } from "@/scaffolds/editor";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function DeleteFormSection() {
  const [state] = useEditorState();

  const confirmationText = "DELETE " + state.form_title;

  return (
    <div className="bg-destructive/20 border border-destructive/30 text-sm rounded-lg p-4">
      <div className="flex flex-col gap-4">
        <article className="prose prose-sm dark:prose-invert">
          <h4>Deleting this form will also remove collected responses</h4>
          <p>
            Ensure you&apos;ve backed up your data if you wish to preserve it.
          </p>
        </article>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-min">
              Delete Form
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Are you sure you want to delete this form?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. All collected responses will be
                deleted.
                <br />
                Type{" "}
                <code className="bg-muted p-1 rounded-md text-sm font-mono">
                  {confirmationText}
                </code>{" "}
                to delete this form
              </AlertDialogDescription>
            </AlertDialogHeader>

            <form
              id="delete-form"
              action={`/private/editor/settings/delete`}
              method="POST"
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="form_id" value={state.form_id} />
              <Input
                required
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                autoSave="off"
                spellCheck="false"
                type="text"
                name="comfirmation_text"
                placeholder={confirmationText}
                pattern={confirmationText}
              />
            </form>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary">Cancel</Button>
              </AlertDialogCancel>
              <Button
                variant="destructive"
                form="delete-form"
                type="submit"
                className="focus:outline-none text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900"
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
