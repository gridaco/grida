"use client";

import { formatDistanceToNow } from "date-fns";
import { fmt_local_index } from "@/utils/fmt";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormCustomerDetail } from "@/app/(api)/private/editor/customers/[uid]/route";
import useSWR, { mutate } from "swr";
import { Spinner } from "@/components/spinner";
import { ClockIcon, Cross1Icon, Link2Icon } from "@radix-ui/react-icons";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit2Icon,
  MoreHorizontal,
} from "lucide-react";
import { ThemedMonacoEditor } from "@/components/monaco";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import React, { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import CustomerEditDialog, {
  CustomerEditDialogDTO,
} from "@/scaffolds/platform/customer/customer-edit-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TagInput } from "@/components/tag";
import { useProject } from "@/scaffolds/workspace";

type Params = {
  uid: string;
};

function useCustomer(project_id: number, uid: string) {
  const supabase = useMemo(() => createClientWorkspaceClient(), []);
  const _delete = useCallback(async () => {
    const { count } = await supabase
      .from("customer")
      .delete({ count: "exact" })
      .eq("uid", uid)
      .select();

    if (count === 0) {
      return false;
    }
    return true;
  }, [uid, supabase]);

  const _update = useCallback(
    async (data: CustomerEditDialogDTO) => {
      const { error } = await supabase
        .from("customer")
        .update(data)
        .eq("uid", uid)
        .select("*")
        .single();

      if (error) {
        return false;
      }

      return true;
    },
    [uid, supabase]
  );

  const _update_metadata = async (metadata: any) => {
    const { error } = await supabase
      .from("customer")
      .update({ metadata })
      .eq("uid", uid)
      .select("*")
      .single();

    if (error) {
      return false;
    }

    return true;
  };

  const _update_description = async (description: string | null) => {
    const { error } = await supabase
      .from("customer")
      .update({ description })
      .eq("uid", uid)
      .select("*")
      .single();

    if (error) {
      return false;
    }

    return true;
  };

  const _update_tags = async (tags: string[]) => {
    const { error } = await supabase.rpc("update_customer_tags", {
      p_customer_uid: uid,
      p_project_id: project_id,
      p_tags: tags,
    });

    if (error) {
      return false;
    }

    return true;
  };

  return useMemo(
    () => ({
      delete: _delete,
      update: _update,
      update_metadata: _update_metadata,
      update_description: _update_description,
      update_tags: _update_tags,
    }),
    [uid, supabase]
  );
}

export default function CustomerDetailPage({ params }: { params: Params }) {
  const { uid } = params;

  const router = useRouter();
  const { id: project_id } = useProject();
  const actions = useCustomer(project_id, uid);

  const key = `/private/editor/customers/${uid}`;
  const { data: customer } = useSWR<FormCustomerDetail>(
    key,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  const editCustomerDialog = useDialogState("edit-customer", {
    refreshkey: true,
  });

  const editNotesDialog = useDialogState("edit-notes", {
    refreshkey: true,
  });

  const editMetadataDialog = useDialogState("edit-metadata", {
    refreshkey: true,
  });

  const editTagsDialog = useDialogState("edit-tags", {
    refreshkey: true,
  });

  const deleteCustomerDialog = useDialogState("delete-customer", {
    refreshkey: true,
  });

  const onDeleteCustomer = async () => {
    const success = await actions.delete();
    if (success) {
      router.replace("./");
    } else {
      toast.error("Failed to delete customer");
    }
  };

  const onUpdateCustomer = async (data: CustomerEditDialogDTO) => {
    const success = await actions.update(data);
    mutate(key);

    if (success) {
      toast.success("Metadata updated");
    } else {
      toast.error("Failed to update metadata");
    }

    return success;
  };

  const onUpdateCustomerMetadata = async (metadata: any) => {
    const success = await actions.update_metadata(metadata);
    mutate(key);
    if (success) {
      toast.success("Customer updated");
    } else {
      toast.error("Failed to update customer");
    }

    return success;
  };

  const onUpdateCustomerDescription = async (description: string) => {
    const success = await actions.update_description(description);
    mutate(key);
    return success;
  };

  const onUpdateCustomerTags = async (tags: string[]) => {
    const success = await actions.update_tags(tags);
    mutate(key);

    if (success) {
      toast.success("Customer updated");
    } else {
      toast.error("Failed to update customer");
    }
    return success;
  };

  if (!customer) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const customer_since_relative = formatDistanceToNow(customer.created_at, {
    addSuffix: false,
  });

  const customer_last_seen_relative = formatDistanceToNow(
    customer.last_seen_at,
    {
      addSuffix: true,
    }
  );

  const customer_since_absolute = new Date(
    customer.created_at
  ).toLocaleDateString();

  return (
    <div className="container mx-auto py-6 max-w-screen-lg">
      <ConfirmDeleteCustomerDialog
        key={deleteCustomerDialog.refreshkey}
        {...deleteCustomerDialog.props}
        onDelete={onDeleteCustomer}
        customer={customer}
      />
      <MetadataEditDialog
        key={editMetadataDialog.refreshkey}
        {...editMetadataDialog.props}
        defaultValue={customer.metadata}
        onSave={onUpdateCustomerMetadata}
      />
      <NotesEditDialog
        key={editNotesDialog.refreshkey}
        {...editNotesDialog.props}
        defaultValue={customer.description}
        onSave={onUpdateCustomerDescription}
      />
      <TagsEditDialog
        key={editTagsDialog.refreshkey}
        {...editTagsDialog.props}
        defaultValue={customer.tags}
        onSave={onUpdateCustomerTags}
      />
      <CustomerEditDialog
        key={editCustomerDialog.refreshkey}
        {...editCustomerDialog.props}
        operation="update"
        onSubmit={onUpdateCustomer}
        default={customer}
      />

      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Link href={"./"}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1
              data-unnamed={!customer.name}
              className="text-xl font-semibold data-[unnamed=true]:text-muted-foreground data-[unnamed=true]:underline data-[unnamed=true]:decoration-dashed"
            >
              {customer.name || "Unnamed Customer"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Customer for {customer_since_relative} / Last seen{" "}
              {customer_last_seen_relative}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                More actions
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={deleteCustomerDialog.openDialog}
              >
                Delete Customer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex">
            <Button
              variant="outline"
              size="sm"
              className="rounded-r-none border-r-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="rounded-l-none">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column (2/3 width) */}
        <aside className="md:col-span-2 space-y-6">
          <Tabs defaultValue="responses">
            <TabsList>
              <TabsTrigger value="responses">Forms</TabsTrigger>
              <TabsTrigger disabled value="activity">
                Recent activity
              </TabsTrigger>
              <TabsTrigger disabled value="logs">
                Logs
              </TabsTrigger>
              <TabsTrigger disabled value="events">
                Events
              </TabsTrigger>
            </TabsList>
            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>
                    Recent interactions with this customer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">{/*  */}</div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="logs">
              <Card>
                <CardHeader>
                  <CardTitle>Logs</CardTitle>
                  <CardDescription>
                    System logs related to this customer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">{/*  */}</div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="events">
              <Card>
                <CardHeader>
                  <CardTitle>Events</CardTitle>
                  <CardDescription>
                    Events triggered by or for this customer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">{/*  */}</div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="responses">
              <Card>
                <CardHeader>
                  <CardTitle>Form Responses</CardTitle>
                  <CardDescription>
                    Responses submitted by this customer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {customer.responses.length === 0 && (
                      <p className="text-muted-foreground">
                        No responses submitted by this customer
                      </p>
                    )}
                    {customer.responses.map((response) => (
                      <li
                        key={response.id}
                        className="flex items-center group border-b border-dashed hover:border-black"
                      >
                        <Link2Icon className="mr-2" />
                        {response.form.title}
                        <span className="font-mono">
                          {fmt_local_index(response.local_index)}
                        </span>
                      </li>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </aside>

        {/* Right Column (1/3 width) */}
        <aside className="space-y-6">
          {/* Customer Info Card */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-base">Customer</h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={editCustomerDialog.openDialog}>
                    Edit contact information
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    Edit marketing settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-6">
              {/* Contact Information */}
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Contact information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p
                      aria-description="email"
                      className="text-sm text-blue-600"
                    >
                      {customer.email || "-"}
                    </p>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p aria-description="phone" className="text-sm">
                    {customer.phone || "-"}
                  </p>
                </div>
              </div>

              {/* Customer since */}
              <div>
                <h3 className="text-sm font-medium mb-2">Customer since</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <ClockIcon />
                  {customer_since_absolute}
                </p>
              </div>

              {/* Marketing */}
              <div>
                <h3 className="text-sm font-medium mb-2">Marketing</h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <p className="text-sm">Email subscribed</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <p className="text-sm">SMS subscribed</p>
                  </div>
                </div>
              </div>
              {/* Identifiers */}
              <div>
                <h3 className="text-sm font-medium mb-2">Identities</h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm">{customer.uid}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm">{customer.uuid}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Tags Card */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-base">Tags</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={editTagsDialog.openDialog}
              >
                <Edit2Icon className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {customer.tags.length === 0 && (
                <Badge
                  variant="outline"
                  className="border-dashed text-muted-foreground"
                >
                  No tags set
                </Badge>
              )}
              {customer.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Notes Card */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-base">Notes</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={editNotesDialog.openDialog}
                  >
                    <Edit2Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit notes</TooltipContent>
              </Tooltip>
            </div>
            <article className="prose prose-sm dark:prose-invert">
              <p>{customer.description || "-"}</p>
            </article>
          </Card>

          {/* Metadata Card */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-base">Metadata</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={editMetadataDialog.openDialog}
              >
                <Edit2Icon className="h-4 w-4" />
              </Button>
            </div>
            {customer.metadata ? (
              <></>
            ) : (
              <div className="flex items-center justify-center aspect-video border border-dashed border-muted">
                <span className="text-muted-foreground text-sm">
                  No metadata
                </span>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MetadataEditDialog({
  defaultValue,
  onSave,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  defaultValue: unknown;
  onSave: (data: Record<string, any> | null) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState<string | null | undefined>(null);

  const submit = async () => {
    const v = edit ?? null;
    if (v === null) {
      await onSave?.(null).then((success) => {
        if (success) props.onOpenChange?.(false);
      });
    }

    try {
      const data = JSON.parse(edit as string);
      await onSave?.(data).then((success) => {
        if (success) props.onOpenChange?.(false);
      });
    } catch (e) {
      toast.error("Invalid JSON");
    }
  };

  return (
    <AlertDialog {...props}>
      <AlertDialogContent>
        <ThemedMonacoEditor
          defaultValue={
            defaultValue ? JSON.stringify(defaultValue, null, 2) : ""
          }
          language="json"
          className="h-96"
          onChange={(value) => setEdit(value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={submit}>Save</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NotesEditDialog({
  defaultValue,
  onSave,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  defaultValue: string | null;
  onSave: (data: string) => Promise<boolean>;
}) {
  const [txt, setTxt] = useState<string>(defaultValue ?? "");

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit note</DialogTitle>
          <DialogDescription className="sr-only">
            Edit customer note / customer description
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Add a note"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          <Button
            disabled={txt === defaultValue}
            onClick={() => {
              onSave(txt).then((success) => {
                if (success) {
                  toast.success("Note saved");
                } else {
                  toast.error("Failed to save note");
                }
              });
              props.onOpenChange?.(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagsEditDialog({
  defaultValue,
  options,
  onSave,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  defaultValue: string[];
  options?: string[];
  onSave: (tags: string[]) => Promise<boolean>;
}) {
  const [i, set_i] = useState<number | null>(null);
  const [__tags, __set_tags] = useState<{ id: string; text: string }[]>(
    defaultValue.map((t) => ({ id: t, text: t }))
  );

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tags</DialogTitle>
          <DialogDescription className="sr-only">
            Edit customer tags
          </DialogDescription>
        </DialogHeader>
        {/*  */}
        <TagInput
          tags={__tags}
          setTags={__set_tags}
          activeTagIndex={i}
          setActiveTagIndex={set_i}
          enableAutocomplete={(options?.length ?? 0) > 0}
          autocompleteOptions={options?.map((t) => ({ id: t, text: t }))}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onSave(__tags.map((t) => t.text));
              props.onOpenChange?.(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDeleteCustomerDialog({
  customer,
  onDelete,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  customer: { name: string | null };
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog {...props}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {customer.name || "(Unnamed Customer)"}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <div>
          <p className="text-sm">
            Are you sure you want to delete the customer{" "}
            <strong>{customer.name || "(Unnamed Customer)"}</strong>? This can't
            be undone.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Cancel
          </AlertDialogCancel>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onDelete().finally(() => {
                setBusy(false);
                props.onOpenChange?.(false);
              });
            }}
          >
            {busy && <Spinner className="me-2" />}
            Delete Customer
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
