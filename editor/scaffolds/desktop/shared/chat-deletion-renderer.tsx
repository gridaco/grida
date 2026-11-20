import { createRoot } from "react-dom/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@app/ui/components/alert-dialog";
import "./chat-deletion-renderer.css";

const { title, ownedChildren, action } = JSON.parse(
  document.getElementById("dialog-data")!.textContent!
) as { title: string | null; ownedChildren?: number; action: string };

const dark = matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

function answer(value: "cancel" | "confirm") {
  location.href = `${action}?answer=${value}`;
}

createRoot(document.getElementById("root")!).render(
  <AlertDialog open onOpenChange={(open) => !open && answer("cancel")}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete chat?</AlertDialogTitle>
        {title && (
          <p className="w-full truncate text-sm font-medium">{title}</p>
        )}
        <AlertDialogDescription>
          This permanently deletes the chat, its private files, and any attached
          side chats.
          {ownedChildren
            ? ` This also deletes ${ownedChildren} named ${ownedChildren === 1 ? "subagent" : "subagents"} and their private data.`
            : ""}{" "}
          This can’t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={(event) => {
            event.preventDefault();
            answer("confirm");
          }}
        >
          Permanently delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
