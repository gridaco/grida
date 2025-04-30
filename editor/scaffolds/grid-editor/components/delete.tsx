import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { txt_n_plural } from "@/utils/plural";
import { TrashIcon } from "@radix-ui/react-icons";

export function DeleteSelectionButton({
  count,
  keyword,
  onDeleteClick,
  className,
  ...props
}: {
  count: number;
  keyword: string;
  onDeleteClick?: () => void;
} & React.ComponentProps<typeof Button>) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" {...props} className={className}>
          <TrashIcon />
          Delete {txt_n_plural(count, keyword)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>
          Delete {txt_n_plural(count, keyword)}
        </AlertDialogTitle>
        <AlertDialogDescription>
          Deleting this record will remove all data associated with it. Are you
          sure you want to delete this record?
        </AlertDialogDescription>
        <div className="flex justify-end gap-2 p-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={onDeleteClick}
          >
            Delete
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
