"use client";

import React, { useState } from "react";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/scaffolds/workspace";
import Link from "next/link";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { editorlink } from "@/lib/forms/url";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/spinner";
import {
  NewDocumentRequest,
  NewDocumentResponse,
} from "@/app/(api)/private/editor/new/route";
import toast from "react-hot-toast";
import { Switch } from "@/components/ui/switch";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

async function create_new_document(
  init: NewDocumentRequest
): Promise<NewDocumentResponse> {
  return fetch(`/private/editor/new`, {
    method: "POST",
    body: JSON.stringify(init),
    headers: {
      "Content-Type": "application/json",
    },
  }).then((res) => res.json());
}

export function CreateNewDocumentButton({
  project_name,
  project_id,
  children,
}: React.PropsWithChildren<{
  project_name: string;
  project_id: number;
}>) {
  const {
    organization: { name: organization_name },
  } = useWorkspace();

  const newDatabaseDialog = useDialogState();
  const newBucketDialog = useDialogState();

  const router = useRouter();

  const new_default_form = async () => {
    const promise = create_new_document({
      project_id: project_id,
      doctype: "v0_form",
    });

    toast.promise(promise, {
      loading: "Creating...",
      error: "Failed to create form",
      success: "Form created",
    });

    promise.then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }
      if (data) {
        // client side redirect
        router.push(data.redirect);
        toast.loading("Loading...");
      }
    });
  };

  const new_default_cavas = async () => {
    const promise = create_new_document({
      project_id: project_id,
      doctype: "v0_canvas",
    });

    toast.promise(promise, {
      loading: "Creating...",
      error: "Failed to create canvas",
      success: "Canvas created",
    });

    promise.then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }
      if (data) {
        // client side redirect
        router.push(data.redirect);
        toast.loading("Loading...");
      }
    });
  };

  const new_formn_with_template = async (template: string) => {
    const res = await fetch(
      `/private/editor/new/template?project_id=${project_id}&template=${template}&doctype=v0_form`,
      {
        method: "POST",
      }
    );

    const { form_document_id } = await res.json();

    // TODO: add globl spinner to block ui

    router.push(
      editorlink("connect", {
        document_id: form_document_id,
        org: organization_name,
        proj: project_name,
      })
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Forms / Events</DropdownMenuLabel>
            <DropdownMenuItem onSelect={new_default_form}>
              <ResourceTypeIcon
                type="v0_form"
                className="w-4 h-4 me-2 align-middle"
              />
              Blank Form
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                new_formn_with_template("headless");
              }}
            >
              <ResourceTypeIcon
                type="dev"
                className="w-4 h-4 me-2 align-middle"
              />
              Blank Headless Form
            </DropdownMenuItem>
            <Link href="/forms/ai" target="_blank">
              <DropdownMenuItem>
                <ResourceTypeIcon
                  type="ai"
                  className="w-4 h-4 me-2 align-middle"
                />
                Create with AI
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <Link href={`/${organization_name}/${project_name}/new/referral`}>
              <DropdownMenuItem>
                <ResourceTypeIcon
                  type="campaign"
                  className="w-4 h-4 me-2 align-middle"
                />
                Referral
                <Badge variant="outline" className="ms-auto">
                  beta
                </Badge>
              </DropdownMenuItem>
            </Link>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Database / Storage</DropdownMenuLabel>
            <DropdownMenuItem onSelect={newDatabaseDialog.openDialog}>
              <ResourceTypeIcon
                type="database"
                className="w-4 h-4 me-2 align-middle"
              />
              Database
              <Badge variant="outline" className="ms-auto">
                beta
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={newBucketDialog.openDialog}>
              <ResourceTypeIcon
                type="v0_bucket"
                className="w-4 h-4 me-2 align-middle"
              />
              Storage
              <Badge variant="outline" className="ms-auto">
                beta
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={IS_PRODUCTION}
              onSelect={() => alert("coming soon")}
            >
              <ResourceTypeIcon
                type="i18n"
                className="w-4 h-4 me-2 align-middle"
              />
              Localization
              <Badge variant="outline" className="ms-auto">
                soon
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Design</DropdownMenuLabel>
            <DropdownMenuItem onSelect={new_default_cavas}>
              <ResourceTypeIcon
                type="v0_canvas"
                className="w-4 h-4 me-2 align-middle"
              />
              Canvas
              <Badge variant="outline" className="ms-auto">
                canary
              </Badge>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateNewDatabaseDialog
        project_id={project_id}
        project_name={project_name}
        {...newDatabaseDialog.props}
      />
      <CreateNewBucketDialog
        project_id={project_id}
        project_name={project_name}
        {...newBucketDialog.props}
      />
    </>
  );
}

function CreateNewDatabaseDialog({
  project_name,
  project_id,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  project_id: number;
  project_name: string;
}) {
  const router = useRouter();
  const [resourceType, setResourceType] = useState<"database" | "table">(
    "database"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");

  const save_disabled = resourceType !== "database" || busy;

  const onSaveClick = () => {
    setBusy(true);
    create_new_document({
      project_id: project_id,
      doctype: "v0_schema",
      name: name,
    })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        }
        if (data) {
          setError(undefined);

          // client side redirect
          router.push(data.redirect);
          return;
        }

        // this shall not be raeched when success
        setBusy(false);
      })
      .catch(() => {
        setError("Unknown error. Please try again.");
        setBusy(false);
      });
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Database</DialogTitle>
          <DialogDescription>
            Create a new CMS database schema
          </DialogDescription>
        </DialogHeader>
        <div className="w-full">
          <Tabs
            value={resourceType}
            onValueChange={(v) => setResourceType(v as any)}
          >
            <TabsList>
              <TabsTrigger value="database">
                <ResourceTypeIcon type="database" className="w-4 h-4 me-2" />
                Database
              </TabsTrigger>
              <TabsTrigger value="table">
                <ResourceTypeIcon type="table" className="w-4 h-4 me-2" />
                Table
              </TabsTrigger>
            </TabsList>
            <TabsContent value="database" className="py-4">
              <div className="grid gap-2">
                <Label>Database Name</Label>
                <Input
                  autoFocus
                  required
                  minLength={1}
                  placeholder="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className="text-muted-foreground text-xs max-w-80">
                  {error && (
                    <span className="text-destructive">
                      {error}
                      <br />
                      <br />
                    </span>
                  )}
                  <>
                    Database name should be unique across the project. lowercase
                    and underscore `_` only.
                  </>
                </span>
              </div>
            </TabsContent>
            <TabsContent value="table" className="py-4">
              <article className="prose prose-sm dark:prose-invert">
                <p>
                  <InfoCircledIcon className="inline w-4 h-4 me-1" />
                  To add a new table, open a database and click &lsquo;+&rsquo;
                  button.
                </p>
              </article>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            disabled={save_disabled}
            onClick={onSaveClick}
            className="min-w-20"
          >
            {busy ? <Spinner /> : <>Create</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateNewBucketDialog({
  project_id,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  project_id: number;
  project_name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const onSaveClick = () => {
    setBusy(true);
    create_new_document({
      project_id: project_id,
      doctype: "v0_bucket",
      name: name,
      public: isPublic,
    })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        }
        if (data) {
          setError(undefined);

          // client side redirect
          router.push(data.redirect);
          return;
        }

        // this shall not be raeched when success
        setBusy(false);
      })
      .catch(() => {
        setError("Unknown error. Please try again.");
        setBusy(false);
      });
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Storage</DialogTitle>
          <DialogDescription>Create a new storage bucket</DialogDescription>
        </DialogHeader>
        <hr />
        <div className="w-full flex flex-col gap-5">
          <div className="grid gap-2">
            <Label>Name of bucket</Label>
            <Input
              autoFocus
              required
              minLength={1}
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="text-muted-foreground text-xs max-w-80">
              {error && (
                <span className="text-destructive">
                  {error}
                  <br />
                  <br />
                </span>
              )}
              <>
                Bucket name should be unique across the project. lowercase and
                underscore `_` only.
              </>
            </span>
          </div>
          <hr />
          <div className="flex gap-4">
            <Switch disabled checked={isPublic} onCheckedChange={setIsPublic} />
            <div className="grid gap-2">
              <Label>Public Bucket</Label>
              <span className="text-xs text-muted-foreground">
                Anyone can read files from this bucket.
              </span>
            </div>
          </div>
        </div>
        <hr />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button disabled={busy} onClick={onSaveClick} className="min-w-20">
            {busy ? <Spinner /> : <>Create</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  //
}
