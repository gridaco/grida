"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { editorlink } from "@/lib/forms/url";
import { useEditorState } from "@/scaffolds/editor";
import { generated_form_store_name } from "@/services/utils/generated-form-store-name";
import { ArchiveIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { useState } from "react";

export default function StoreGetStartedPage() {
  return (
    <main className="h-full flex flex-col">
      <div className="h-hull flex-1 flex flex-col justify-center items-center gap-8">
        <ArchiveIcon className="opacity-80" width={80} height={80} />
        <div className="h-hull flex flex-col justify-center items-center">
          <Badge className="mb-2" variant={"outline"}>
            Alpha
          </Badge>
          <h1 className="text-2xl font-bold">Add commerce to your forms</h1>
          <p className="text-sm opacity-80 text-center max-w-md mt-2">
            Create personalized store for your customers. Here you can manage
            your products, inventory, and orders.
          </p>
        </div>
        <footer>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <span>Get started</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>
                <h2 className="text-2xl font-bold">Create or Connect Store</h2>
              </DialogTitle>
              <DialogDescription>
                Connect Store to track inventory, sell products (physical /
                virtyal / tickets), and manage orders.
                <Tooltip defaultOpen={false}>
                  <TooltipTrigger asChild>
                    <InfoCircledIcon className=" inline" />
                  </TooltipTrigger>
                  <TooltipContent>
                    For none physical products, it is a good practice to create
                    each store per form.
                  </TooltipContent>
                </Tooltip>
              </DialogDescription>
              <hr />
              <ConnectStoreForm />
              <hr />
              <DialogFooter>
                <Button variant="ghost">Cancel</Button>
                <Button form="connect-store-form" type="submit">
                  Connect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </footer>
      </div>
    </main>
  );
}

function ConnectStoreForm() {
  const [store_id, setStoreId] = useState<string>();

  const is_create = store_id === "__new__";

  const [state] = useEditorState();

  const { document_id, basepath } = state;

  const next = editorlink("connect/store/products", {
    basepath,
    document_id,
  });

  return (
    <form
      id="connect-store-form"
      action={`/private/editor/connect/${state.form.form_id}/store/connection?next=${next}`}
      method="POST"
      className="prose dark:prose-invert"
    >
      <Select
        value={store_id}
        onValueChange={(id) => setStoreId(id)}
        name="store_id"
      >
        <SelectTrigger>
          <SelectValue
            placeholder="Select your Store"
            aria-label="Select Store"
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__new__">Create New Store</SelectItem>
          {/*  TODO: existing store listing */}
        </SelectContent>
      </Select>
      {is_create && (
        <>
          <h4>
            <span>Create New Store for this Form</span>
          </h4>
          <div>
            <Label htmlFor="name">
              <span>Name</span>
            </Label>
            <Input
              id="name"
              name="name"
              autoFocus
              defaultValue={generated_form_store_name(state.form_title)}
              placeholder="Store Name"
            />
          </div>
        </>
      )}
    </form>
  );
}
