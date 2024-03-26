"use client";

import { useEditorState } from "@/scaffolds/editor";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@editor-ui/alert-dialog";

export function DeleteFormSection() {
  const [state] = useEditorState();

  const confirmationText = "DELETE " + state.form_title;

  return (
    <div className="bg-red-50 border border-red-300 text-red-900 text-sm rounded-lg p-4 dark:bg-red-700 dark:border-red-600 dark:text-red-200 dark:placeholder-red-400 dark:focus:ring-red-500 dark:focus:border-red-500">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg">
          Deleting this form will also remove collected responses
        </h3>
        <p className="opacity-80">
          Ensure you&apos;ve backed up your data if you wish to preserve it.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="focus:outline-none text-red-700 bg-red-100 hover:bg-red-200 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900 w-fit">
              Delete Form
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>
              Are you sure you want to delete this form?
            </AlertDialogTitle>
            <p className="py-4">
              This action cannot be undone. All collected responses will be
              deleted.
            </p>
            <form
              id="delete-form"
              action={`/private/editor/settings/delete`}
              method="POST"
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="form_id" value={state.form_id} />
              <label className="flex flex-col gap-2">
                <span className="opacity-80">
                  Type{" "}
                  <code className="bg-neutral-100 p-1 rounded-md text-sm font-mono">
                    {confirmationText}
                  </code>{" "}
                  to delete this form
                </span>
                <input
                  className="bg-neutral-50 border border-neutral-300 text-neutral-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
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
              </label>
            </form>
            <div className="flex justify-end gap-2 p-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <button
                form="delete-form"
                type="submit"
                className="focus:outline-none text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900"
              >
                Delete
              </button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
