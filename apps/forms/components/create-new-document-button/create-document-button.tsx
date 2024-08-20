"use client";

import {
  ChevronDownIcon,
  InfoCircledIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
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
import { ResourceTypeIcon } from "../resource-type-icon";
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
import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Label } from "@/components/ui/label";
import { EditorApiResponse } from "@/types/private/api";
import { Spinner } from "../spinner";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function CreateNewDocumentButton({
  project_name,
  project_id,
}: {
  project_name: string;
  project_id: number;
}) {
  const {
    state: {
      organization: { name: organization_name },
    },
  } = useWorkspace();

  const newDatabaseDialog = useDialogState();

  const router = useRouter();
  const new_default_form_url = `/private/editor/new?project_id=${project_id}&doctype=v0_form`;
  const new_default_site_url = `/private/editor/new?project_id=${project_id}&doctype=v0_site`;
  const new_default_database_url = `/private/editor/new?project_id=${project_id}&doctype=v0_schema`;

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
        <DropdownMenuTrigger asChild>
          <Button className="gap-1">
            <PlusIcon />
            Create New
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          {/* TODO: alpha feature */}
          <DropdownMenuGroup hidden={IS_PRODUCTION}>
            <DropdownMenuLabel>Sites</DropdownMenuLabel>
            <form action={new_default_site_url} method="POST">
              <button className="w-full">
                <DropdownMenuItem>
                  <ResourceTypeIcon
                    type="v0_site"
                    className="w-4 h-4 me-2 align-middle"
                  />
                  Blank Site
                </DropdownMenuItem>
              </button>
            </form>
            <DropdownMenuItem disabled>
              <ResourceTypeIcon
                type="v0_site"
                className="w-4 h-4 me-2 align-middle"
              />
              Admin Console
              <Badge variant="outline" className="ms-auto">
                soon
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Forms</DropdownMenuLabel>
            <form action={new_default_form_url} method="POST">
              <button className="w-full">
                <DropdownMenuItem>
                  <ResourceTypeIcon
                    type="v0_form"
                    className="w-4 h-4 me-2 align-middle"
                  />
                  Blank Form
                </DropdownMenuItem>
              </button>
            </form>
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
            <Link href="/ai">
              <DropdownMenuItem>
                <ResourceTypeIcon
                  type="ai"
                  className="w-4 h-4 me-2 align-middle"
                />
                Create with AI
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              CMS / Commerce
              <div className="inline-flex ms-auto pl-4">
                <Badge variant="outline">soon</Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={IS_PRODUCTION}
              onSelect={() => newDatabaseDialog.openDialog()}
            >
              <ResourceTypeIcon
                type="database"
                className="w-4 h-4 me-2 align-middle"
              />
              Database
              <Badge variant="outline" className="ms-auto">
                soon
              </Badge>
            </DropdownMenuItem>
            {/* </button>
          </form> */}

            <DropdownMenuItem disabled>
              <ResourceTypeIcon
                type="commerce"
                className="w-4 h-4 me-2 align-middle"
              />
              Store
              <Badge variant="outline" className="ms-auto">
                soon
              </Badge>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateNewDatabaseDialog
        project_id={project_id}
        project_name={project_name}
        {...newDatabaseDialog}
      />
    </>
  );
}

type CreateNewDocumentInit =
  | {
      doctype: "v0_schema";
      name: string;
    }
  | {
      doctype: "v0_form";
      title: string;
    }
  | {
      doctype: "v0_site";
      title: string;
    };

async function create_new_document(
  init: CreateNewDocumentInit
): Promise<EditorApiResponse<{ id: string }>> {
  return fetch(`/private/editor/new`, {
    method: "POST",
    body: JSON.stringify(init),
    headers: {
      "Content-Type": "application/json",
    },
  }).then((res) => res.json());
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
  const {
    state: {
      organization: { name: organization_name },
    },
  } = useWorkspace();
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
      doctype: "v0_schema",
      name: name,
    })
      .then(({ data, error }) => {
        if (error) {
          setError(error);
        }
        if (data) {
          setError(undefined);

          // client side redirect
          router.push(
            editorlink("data", {
              document_id: data.id,
              org: organization_name,
              proj: project_name,
            })
          );
        }
      })
      .catch(() => {
        setError("Unknown error. Please try again.");
      })
      .finally(() => {
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
                <Input required minLength={1} placeholder="name" />
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
                  To add a new table, open a database and click '+' button.
                </p>
              </article>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
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
