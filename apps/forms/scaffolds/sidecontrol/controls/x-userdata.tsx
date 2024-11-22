import { Button } from "@/components/ui/button";
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
import toast from "react-hot-toast";

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
  node_id,
  value,
  onValueCommit,
}: {
  node_id: string;
  value: unknown | undefined;
  onValueCommit: (value: unknown | undefined) => void;
}) {
  const [txt, setTxt] = useState<string | undefined>(
    value ? JSON.stringify(value, null, 2) : ""
  );

  const [valid, setValid] = useState<boolean>(false);

  useEffect(() => {
    setValid(validate(txt) !== false);
  }, [txt]);

  const onSaveClick = () => {
    if (!valid) return;
    const res = validate(txt);
    if (res) {
      onValueCommit(res);
    } else {
      toast.error("Invalid User Data Format");
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" className="w-full">
          Custom Data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Custom Node Data to `{node_id}`</DialogTitle>
          <DialogDescription>
            JSON Serializable data k:v is accepted. Accessible via{" "}
            <code>`node.userdata`</code>
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
          <DialogClose>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose disabled={!valid}>
            <Button disabled={!valid} onClick={onSaveClick}>
              Save
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
