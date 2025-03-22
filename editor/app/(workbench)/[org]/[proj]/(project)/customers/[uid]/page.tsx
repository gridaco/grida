"use client";

import { CalendarIcon, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fmt_local_index } from "@/utils/fmt";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormCustomerDetail } from "@/app/(api)/private/editor/customers/[uid]/route";
import useSWR, { mutate } from "swr";
import { Spinner } from "@/components/spinner";
import { Link2Icon } from "@radix-ui/react-icons";
import { ThemedMonacoEditor } from "@/components/monaco";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useDialogState } from "@/components/hooks/use-dialog-state";

// function useCustomerDetails() {
//   //
// }

type Params = {
  uid: string;
};

export default function CustomerDetailPage({ params }: { params: Params }) {
  const { uid } = params;

  const key = `/private/editor/customers/${uid}`;
  const { data: customer } = useSWR<FormCustomerDetail>(
    key,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  const supabase = useMemo(() => createClientWorkspaceClient(), []);

  const updateCustomerMetadata = async (metadata: any) => {
    const { data, error } = await supabase
      .from("customer")
      .update({ metadata })
      .eq("uid", uid)
      .select("*")
      .single();

    if (error) {
      toast.error("Failed to update metadata");
      return false;
    }

    if (data) {
      mutate(key);
      toast.success("Metadata updated");
      return true;
    }

    return false;
  };

  if (!customer) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Customer</h1>
        <p className="text-muted-foreground">
          View and manage customer details
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">
                  {customer.name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle
                  data-unnamed={!customer.name}
                  className="text-xl data-[unnamed=true]:text-muted-foreground data-[unnamed=true]:underline data-[unnamed=true]:decoration-dashed"
                >
                  {customer.name || "Unnamed Customer"}
                </CardTitle>
                <CardDescription>
                  <pre className="text-muted-foreground overflow-ellipsis text-xs">
                    {customer.uid}
                  </pre>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <hr className="mt-4 mb-8" />
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Email</h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {customer.email ?? "-"}
                  </p>
                  {/* {customer.is_email_verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )} */}
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Phone</h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {customer.phone ?? "-"}
                  </p>
                  {/* {customer.is_phone_verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )} */}
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Created</h3>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {new Date(customer.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Last seen</h3>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(customer.last_seen_at, {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">
                  Description
                </h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {customer.description ?? "-"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="responses">
          <TabsList>
            <TabsTrigger value="responses">Forms</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
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
          <TabsContent value="metadata">
            <MetadataEdit
              uid={uid}
              value={customer.metadata}
              onSubmit={updateCustomerMetadata}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MetadataEdit({
  uid,
  value,
  onSubmit,
}: {
  uid: string;
  value: any;
  onSubmit?: (data: Record<string, any> | null) => Promise<boolean>;
}) {
  const dialog = useDialogState("edit-metadata", { refreshkey: true });
  const [edit, setEdit] = useState<string | null | undefined>(null);

  const submit = async () => {
    const v = edit ?? null;
    if (v === null) {
      await onSubmit?.(null).then((success) => {
        if (success) dialog.closeDialog();
      });
    }

    try {
      const data = JSON.parse(edit as string);
      await onSubmit?.(data).then((success) => {
        if (success) dialog.closeDialog();
      });
    } catch (e) {
      toast.error("Invalid JSON");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Metadata</CardTitle>
        <CardDescription className="max-w-lg">
          Set of key-value pairs that you can attach to a customer. This can be
          useful for storing additional information about the object in a
          structured format.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ThemedMonacoEditor
          height="300px"
          language="json"
          value={JSON.stringify(value, null, 2)}
          options={{
            readOnly: true,
          }}
        />
      </CardContent>
      <CardFooter>
        <AlertDialog {...dialog.props} key={dialog.refreshkey}>
          <AlertDialogTrigger asChild>
            <Button>Edit</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <ThemedMonacoEditor
              defaultValue={value ? JSON.stringify(value, null, 2) : ""}
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
      </CardFooter>
    </Card>
  );
}
