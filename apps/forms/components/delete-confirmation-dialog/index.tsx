import React, { useEffect } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "../spinner";

export function DeleteConfirmationAlertDialog({
  title,
  description,
  placeholder,
  data,
  match,
  onDelete,
  ...props
}: React.ComponentProps<typeof AlertDialog> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
  match?: string;
  data?: {
    id: string;
  };
  /**
   * trigger when the delete button is clicked
   * return a promise that resolves to a boolean indicating if the delete was successful
   * if the promise resolves to true, the dialog will be closed
   */
  onDelete?: (
    data: { id: string },
    user_confirmation_txt: string
  ) => Promise<boolean>;
}) {
  const [confirmation, setConfirmation] = React.useState("");
  const [ismatching, setIsMatching] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  useEffect(() => {
    setIsMatching(confirmation === match);
  }, [confirmation, match]);

  return (
    <AlertDialog {...props}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
          id="delete-confirmation"
          className="flex flex-col gap-4 py-4"
        >
          <Input
            required
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            autoSave="off"
            spellCheck="false"
            type="text"
            name="comfirmation"
            placeholder={placeholder}
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
            }}
          />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={!ismatching || isDeleting}
            form="delete-confirmation"
            variant="destructive"
            onClick={() => {
              setIsDeleting(true);
              onDelete?.(data!, confirmation)
                .then((success) => {
                  if (success) {
                    props.onOpenChange?.(false);
                  }
                })
                .finally(() => {
                  setIsDeleting(false);
                });
            }}
          >
            {isDeleting && <Spinner className="inline-flex me-2" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteConfirmationSnippet({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <code className="bg-muted p-1 rounded-md text-sm font-mono">
      {children}
    </code>
  );
}
