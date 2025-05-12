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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createBrowserClient } from "@/lib/supabase/client";
import React, { useCallback, useMemo, useState, use } from "react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useTags } from "@/scaffolds/workspace";
import { cn } from "@/components/lib/utils";

type Params = {
  uid: string;
};

function useCustomer(project_id: number, uid: string) {
  const supabase = useMemo(() => createBrowserClient(), []);
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

  const _update_marketing = async ({
    email,
    sms,
  }: {
    email: boolean;
    sms: boolean;
  }) => {
    const { error } = await supabase
      .from("customer")
      .update({
        is_marketing_email_subscribed: email,
        is_marketing_sms_subscribed: sms,
      })
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
      update_marketing: _update_marketing,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, supabase]
  );
}

function MarketingStatusDot({
  value,
  className,
}: {
  value: boolean;
  className?: string;
}) {
  return (
    <div
      data-state={value ? "on" : "off"}
      className={cn(
        "size-2 rounded-full data-[state=on]:bg-green-700 data-[state=off]:bg-yellow-700",
        className
      )}
    />
  );
}

export default function CustomerDetailPage(props0: {
  params: Promise<Params>;
}) {
  const params = use(props0.params);
  const { uid } = params;

  const router = useRouter();
  const { id: project_id } = useProject();
  const { tags: allTags, refresh: refreshAllTags } = useTags();
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

  const editMarketingDialog = useDialogState("edit-marketing", {
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

  const onUpdateCustomerMarketing = async (pref: {
    email: boolean;
    sms: boolean;
  }) => {
    const success = await actions.update_marketing(pref);
    mutate(key);
    return success;
  };

  const onUpdateCustomerTags = async (tags: string[]) => {
    const success = await actions.update_tags(tags);
    mutate(key);
    refreshAllTags();

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

  const customer_fallback_display_name =
    customer.name || customer.email || customer.phone;

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
      <MarketingConsentEditDialog
        key={editMarketingDialog.refreshkey}
        {...editMarketingDialog.props}
        defaultValue={{
          email: customer.is_marketing_email_subscribed,
          sms: customer.is_marketing_sms_subscribed,
        }}
        onSave={onUpdateCustomerMarketing}
      />
      <TagsEditDialog
        key={editTagsDialog.refreshkey}
        {...editTagsDialog.props}
        defaultValue={customer.tags}
        options={allTags.map((t) => t.name)}
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
            <Button variant="ghost" size="icon" className="size-8">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1
              data-unnamed={!customer_fallback_display_name}
              className="text-xl font-semibold data-[unnamed=true]:text-muted-foreground data-[unnamed=true]:underline data-[unnamed=true]:decoration-dashed"
            >
              {customer_fallback_display_name || "Unnamed Customer"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Customer for {customer_since_relative}
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
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                variant="destructive"
                onSelect={deleteCustomerDialog.openDialog}
              >
                Delete Customer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* TODO: db cursor navigation */}
          <div className="flex">
            <Button
              disabled
              variant="outline"
              size="sm"
              className="rounded-r-none border-r-0"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              disabled
              variant="outline"
              size="sm"
              className="rounded-l-none"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3 width) */}
        <aside className="lg:col-span-2 space-y-6">
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
              <h2 className="font-medium text-sm">Customer</h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={editCustomerDialog.openDialog}>
                    Edit contact information
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={editMarketingDialog.openDialog}>
                    Edit marketing settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-6">
              {/* Contact Information */}
              <div>
                <h3 className="text-xs font-medium mb-2">
                  Contact information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p
                      aria-description="email"
                      className="text-xs text-blue-600"
                    >
                      {customer.email || "-"}
                    </p>
                    {customer.email && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => {
                          navigator.clipboard.writeText(customer.email!);
                          toast.success("Copied email to clipboard");
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                    )}
                  </div>
                  <p aria-description="phone" className="text-xs">
                    {customer.phone || "-"}
                  </p>
                </div>
              </div>

              {/* Customer since */}
              <div>
                <h3 className="text-xs font-medium mb-2">Customer since</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <ClockIcon />
                  {customer_since_absolute}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-medium mb-2">Last seen</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <ClockIcon />
                  {customer_last_seen_relative}
                </p>
              </div>

              {/* Marketing */}
              <div>
                <h3 className="text-xs font-medium mb-2">Marketing</h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MarketingStatusDot
                      value={customer.is_marketing_email_subscribed}
                    />
                    <p className="text-xs">
                      Email{" "}
                      {customer.is_marketing_email_subscribed
                        ? "subscribed"
                        : "not subscribed"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <MarketingStatusDot
                      value={customer.is_marketing_sms_subscribed}
                    />
                    <p className="text-xs">
                      SMS{" "}
                      {customer.is_marketing_sms_subscribed
                        ? "subscribed"
                        : "not subscribed"}
                    </p>
                  </div>
                </div>
              </div>
              {/* Identifiers */}
            </div>
          </Card>

          {/* Tags Card */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium text-sm">Tags</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={editTagsDialog.openDialog}
              >
                <Edit2Icon className="size-4" />
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
              <h2 className="font-medium text-sm">Notes</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={editNotesDialog.openDialog}
                  >
                    <Edit2Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit notes</TooltipContent>
              </Tooltip>
            </div>
            <article className="prose prose-sm dark:prose-invert">
              <p>{customer.description || "-"}</p>
            </article>
          </Card>

          {/* Identities Card */}
          <Card className="p-4 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium text-sm">Identities</h2>
            </div>
            <Table className="max-w-full overflow-hidden">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">type</TableHead>
                  <TableHead>id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">uid</TableCell>
                  <TableCell>
                    <pre className="truncate">
                      <code>{customer.uid}</code>
                    </pre>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    <code>uuid</code>
                  </TableCell>
                  <TableCell>
                    <pre>
                      <code>{customer.uuid ?? "N/A"}</code>
                    </pre>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          {/* Metadata Card */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium text-sm">Metadata</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={editMetadataDialog.openDialog}
              >
                <Edit2Icon className="size-4" />
              </Button>
            </div>
            {customer.metadata ? (
              <KVTable
                data={customer.metadata}
                className="max-h-[300px] overflow-auto"
              />
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

function KVTable({
  data,
  className,
}: {
  data: Record<string, any>;
  className?: string;
}) {
  return (
    <Table className={cn("w-full", className)}>
      <TableHeader>
        <TableRow>
          <TableHead>Key</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(data).map(([key, value]) => (
          <TableRow key={key}>
            <TableCell className="font-medium">{key}</TableCell>
            <TableCell>{JSON.stringify(value)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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

function MarketingConsentEditDialog({
  defaultValue,
  onSave,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  defaultValue: { email: boolean; sms: boolean };
  onSave: (value: { email: boolean; sms: boolean }) => Promise<boolean>;
}) {
  const [email, setEmail] = useState(defaultValue.email);
  const [sms, setSms] = useState(defaultValue.sms);

  const changed = email !== defaultValue.email || sms !== defaultValue.sms;

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit marketing status</DialogTitle>
          <DialogDescription>
            Ensure you have received explicit consent from your customers before
            enrolling them in marketing email or SMS campaigns.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 my-4">
          <div className="flex flex-row items-start space-x-3 space-y-0">
            <Checkbox
              id="email"
              checked={email}
              onCheckedChange={(s) => setEmail(s === true)}
            />

            <div className="space-y-1 leading-none">
              <Label htmlFor="email">
                The customer has opted in to receive marketing emails.
              </Label>
              <p className="text-[0.8rem] text-muted-foreground">
                Please check with caution
              </p>
            </div>
          </div>
          <div className="flex flex-row items-start space-x-3 space-y-0">
            <Checkbox
              id="sms"
              checked={sms}
              onCheckedChange={(s) => setSms(s === true)}
            />

            <div className="space-y-1 leading-none">
              <Label htmlFor="sms">
                The customer has opted in to receive SMS marketing messages.
              </Label>
              <p className="text-[0.8rem] text-muted-foreground">
                Please check with caution
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          <Button
            disabled={!changed}
            onClick={() => {
              onSave({
                email,
                sms,
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
            <strong>{customer.name || "(Unnamed Customer)"}</strong>? This
            can&apos;t be undone.
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
