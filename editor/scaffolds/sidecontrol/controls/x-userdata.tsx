import { Button } from "@/components/ui-editor/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Editor as MonacoEditor } from "@monaco-editor/react";
import { DialogClose } from "@radix-ui/react-dialog";
import assert from "assert";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNodeMetadata, useCurrentEditor } from "@/grida-canvas-react";

function validate(value: string | undefined): any | false {
  if (value === undefined) return undefined;
  if (value === "") return undefined;
  try {
    const parsed = JSON.parse(value);
    // check if object (not array)
    assert(parsed && typeof parsed === "object" && !Array.isArray(parsed));
    return parsed;
  } catch (e) {
    return false;
  }
}

export function UserDataControl({
  disabled,
  node_id,
}: {
  disabled?: boolean;
  node_id: string;
}) {
  const editor = useCurrentEditor();
  const value = useNodeMetadata(node_id, "userdata");
  const [txt, setTxt] = useState<string | undefined>(
    value ? JSON.stringify(value, null, 2) : ""
  );

  const [valid, setValid] = useState<boolean>(false);

  // Sync txt state when value changes
  useEffect(() => {
    setTxt(value ? JSON.stringify(value, null, 2) : "");
  }, [value]);

  useEffect(() => {
    setValid(validate(txt) !== false);
  }, [txt]);

  const onSaveClick = () => {
    if (!valid) return;
    const res = validate(txt);
    if (res) {
      editor.setUserData(node_id, res as Record<string, unknown> | null);
    } else {
      toast.error("Invalid User Data Format");
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          disabled={disabled}
        >
          Custom Data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Custom Node Data to `{node_id}`</DialogTitle>
          <DialogDescription>
            JSON Serializable data k:v is accepted. Accessible via{" "}
            <code>`metadata.userdata`</code>
          </DialogDescription>
        </DialogHeader>
        <hr />
        <MonacoEditor
          language="json"
          value={JSON.stringify(value, null, 2)}
          width="100%"
          height={500}
          onChange={(value) => {
            setTxt(value);
          }}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose disabled={!valid} asChild>
            <Button disabled={!valid} onClick={onSaveClick}>
              Save
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
