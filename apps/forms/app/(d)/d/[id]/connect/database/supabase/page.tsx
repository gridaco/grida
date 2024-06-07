"use client";
import Axios from "axios";
import React, { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CodeIcon,
  EyeNoneIcon,
  EyeOpenIcon,
  LockClosedIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import toast from "react-hot-toast";
import { SupabaseLogo } from "@/components/logos";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SupabasePublicSchema,
  build_supabase_rest_url,
  parseSupabaseSchema,
  ping,
} from "@/lib/supabase-postgrest";
import { SupabaseConnection, SupabaseConnectionTable } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import assert from "assert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ConnectDB({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const form_id = params.id;

  return (
    <main className="max-w-2xl mx-auto mt-10">
      <ConnectSupabase form_id={form_id} />
    </main>
  );
}

async function sbconn_create_connection(
  form_id: string,
  data: {
    sb_anon_key: string;
    sb_project_url: string;
  }
) {
  return Axios.post(`/private/editor/connect/${form_id}/supabase`, data);
}

async function sbconn_refresh_connection(form_id: string) {
  return Axios.patch(`/private/editor/connect/${form_id}/supabase`);
}

async function sbconn_get_connection(form_id: string) {
  return Axios.get<{
    data: SupabaseConnection & {
      connection_table: SupabaseConnectionTable | null;
    };
  }>(`/private/editor/connect/${form_id}/supabase`);
}

async function sbconn_remove_connection(form_id: string) {
  return Axios.delete(`/private/editor/connect/${form_id}/supabase`);
}

async function sbconn_create_secret(form_id: string, data: { secret: string }) {
  return Axios.post(
    `/private/editor/connect/${form_id}/supabase/secure-service-key`,
    data
  );
}

async function sbconn_reveal_secret(form_id: string) {
  return Axios.get(
    `/private/editor/connect/${form_id}/supabase/secure-service-key`
  );
}

async function sbconn_create_connection_table(
  form_id: string,
  data: { table: string }
) {
  return Axios.put(`/private/editor/connect/${form_id}/supabase/table`, data);
}

function ConnectSupabase({ form_id }: { form_id: string }) {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [schema, setSchema] = useState<SupabasePublicSchema | null>(null);
  const [table, setTable] = useState<string | undefined>(undefined);

  const [connection, setConnection] = useState<
    SupabaseConnection | null | undefined
  >(undefined);

  const is_loaded = schema !== null;
  const is_connected = !!connection;
  const is_service_key_set = !!connection?.sb_service_key_id;

  const disabled = !url || !anonKey;

  useEffect(() => {
    sbconn_get_connection(form_id)
      .then((res) => {
        const data = res.data.data;
        setConnection(data);
        setUrl(data.sb_project_url);
        setAnonKey(data.sb_anon_key);
        setSchema(data.sb_public_schema as {});
        setTable(data.connection_table?.sb_table_name);
        console.log(data);
      })
      .catch((err) => {
        setConnection(null);
      });
  }, [form_id]);

  const onClearClick = () => {
    setUrl("");
    setAnonKey("");
    setSchema(null);
    setTable(undefined);
    setConnection(null);
  };

  const onTestConnectionClick = async () => {
    const parsing = parseSupabaseSchema({
      url,
      anonKey,
    }).then((res) => {
      setSchema(res.sb_public_schema);
    });

    toast.promise(parsing, {
      loading: "Parsing OpenAPI...",
      success: "Valid Connection",
      error: "Failed to connect to Supabase",
    });
  };

  const onRefreshSchemaClick = async () => {
    const res = sbconn_refresh_connection(form_id);
    toast.promise(res, {
      loading: "Refreshing Schema...",
      success: "Schema Refreshed",
      error: "Failed to refresh schema",
    });

    res.then((res) => {
      setSchema(res.data.data.sb_public_schema);
    });
  };

  const onConnectClick = async () => {
    const data = {
      sb_anon_key: anonKey,
      sb_project_url: url,
    };

    const res = sbconn_create_connection(form_id, data);

    toast
      .promise(res, {
        loading: "Creating Connection...",
        success: "Connection Created",
        error: "Failed to create connection",
      })
      .then((res) => {
        setConnection(res.data.data);
      });
  };

  const onRemoveConnectionClick = async () => {
    const res = sbconn_remove_connection(form_id);

    toast
      .promise(res, {
        loading: "Removing Connection...",
        success: "Connection Removed",
        error: "Failed to remove connection",
      })
      .then(() => {
        setConnection(null);
        setUrl("");
        setAnonKey("");
        setSchema(null);
        setTable(undefined);
      });
  };

  const onServiceKeySaveClick = async () => {
    // validate service key
    // ping test
    ping({ url: build_supabase_rest_url(url), key: serviceKey }).then((res) => {
      if (res.status === 200) {
        // create secret key connection
        const data = {
          secret: serviceKey,
        };

        const res = sbconn_create_secret(form_id, data);

        res.then((res) => {
          setConnection((prev) => ({
            ...prev!,
            sb_service_key_id: res.data.data,
          }));
        });

        toast.promise(res, {
          loading: "Saving Service Key...",
          success: "Service Key Saved",
          error: "Failed to save service key",
        });
      } else {
        toast.error("Service Key is invalid");
      }
    });
  };

  const onSaveMainTableClick = async () => {
    assert(table);
    const res = sbconn_create_connection_table(form_id, { table });

    toast.promise(res, {
      loading: "Saving Main Table...",
      success: "Main Table Saved",
      error: "Failed to save main table",
    });
  };

  return (
    <div className="space-y-10">
      {connection === undefined ? (
        <LoadingCard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <SupabaseLogo size={20} className="inline me-2 align-middle" />
              Connect Supabase
            </CardTitle>
            <CardDescription>
              Connect your Supabase account to access your database.{" "}
              <Link
                href="https://supabase.com/docs/guides/api#api-url-and-keys"
                target="_blank"
                className="underline"
              >
                Learn more
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-10">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="url">Project URL</Label>
                  <Input
                    className="font-mono"
                    id="url"
                    name="url"
                    type="url"
                    disabled={is_loaded}
                    required
                    placeholder="https://your-project-ref.supabase.co"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="anonkey">
                    Anon Key
                    <Tooltip>
                      <TooltipTrigger>
                        <QuestionMarkCircledIcon className="inline ms-2 align-middle" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        This key is safe to use in a browser if you have enabled
                        Row Level Security for your tables and configured
                        policies.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    className="font-mono"
                    id="anonkey"
                    name="anonkey"
                    type="text"
                    autoComplete="off"
                    disabled={is_loaded}
                    required
                    placeholder="eyxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx-xxxxxxxxx"
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            {!is_loaded && (
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={onTestConnectionClick}
              >
                Test Connection
              </Button>
            )}
            {is_loaded && !is_connected && (
              <Button variant="outline" onClick={onClearClick}>
                Clear
              </Button>
            )}
            {is_connected && (
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={onRefreshSchemaClick}
              >
                Refresh Schema
              </Button>
            )}
            {is_connected && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Remove Connection</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you sure you want to remove the connection?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action is irreversible. You will lose access to your
                      database.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className={buttonVariants({ variant: "destructive" })}
                      onClick={onRemoveConnectionClick}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {is_loaded && !is_connected && (
              <Button onClick={onConnectClick}>Connect</Button>
            )}
          </CardFooter>
        </Card>
      )}
      <Card hidden={!is_connected}>
        <CardHeader>
          <CardTitle>
            <LockClosedIcon className="inline me-2 align-middle w-5 h-5" />
            Service Role Key
          </CardTitle>
          <CardDescription>
            If you wish to bypass RLS and use Form as a admin, you can provide{" "}
            <Link
              href="https://supabase.com/docs/guides/api/api-keys"
              target="_blank"
            >
              <u>service_role key.</u>
            </Link>
            <br />
            We securely handle and save your service key in{" "}
            <Link
              href="https://supabase.com/docs/guides/database/vault"
              target="_blank"
            >
              <u>supabase vault</u>
            </Link>{" "}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="service_role">
              Service Key
              <Tooltip>
                <TooltipTrigger>
                  <QuestionMarkCircledIcon className="inline ms-2 align-middle" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  This key has the ability to bypass Row Level Security. We
                  never use this key on the client side. Only opt-in functions
                  will use this key to perform the request
                </TooltipContent>
              </Tooltip>
            </Label>
            <div>
              {is_service_key_set ? (
                <>
                  <RevealSecret
                    fetcher={async () => {
                      const res = await sbconn_reveal_secret(form_id);
                      return res.data.data;
                    }}
                  />
                </>
              ) : (
                <>
                  <Input
                    className="font-mono"
                    id="service_role"
                    name="service_role"
                    type="password"
                    placeholder="eyxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx-xxxxxxxxx"
                    value={serviceKey}
                    onChange={(e) => setServiceKey(e.target.value)}
                  />
                </>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <div hidden={!!connection?.sb_service_key_id}>
            <Button disabled={!serviceKey} onClick={onServiceKeySaveClick}>
              Save
            </Button>
          </div>
        </CardFooter>
      </Card>
      <Card hidden={!is_connected}>
        <CardHeader>
          <CardTitle>Main Datasource</CardTitle>
          <CardDescription>
            Grida Forms Allow you to connect to one of your supabase table to
            the form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schema && (
            <div>
              <Select value={table} onValueChange={(value) => setTable(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select main datasource" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(schema).map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {table && (
                <>
                  <hr className="my-4" />
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Column</TableHead>
                        <TableHead>Data Type</TableHead>
                        <TableHead>PostgreSQL Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(schema[table].properties).map(
                        ([prop, value]) => {
                          const required =
                            schema[table].required.includes(prop);
                          return (
                            <TableRow key={prop}>
                              <TableCell>
                                {prop}{" "}
                                {required && (
                                  <span className="text-xs text-foreground-muted text-red-500">
                                    *
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>{value.type}</TableCell>
                              <TableCell>{value.format}</TableCell>
                            </TableRow>
                          );
                        }
                      )}
                    </TableBody>
                  </Table>
                  <Collapsible className="mt-4">
                    <CollapsibleTrigger>
                      <Button variant="link" size="sm">
                        <CodeIcon className="me-2 align-middle" /> Raw JSON
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <article className="prose dark:prose-invert">
                        <pre>{JSON.stringify(schema[table], null, 2)}</pre>
                      </article>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button disabled={!table} onClick={onSaveMainTableClick}>
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="w-24 h-5" />
        <Skeleton className="w-full h-2" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Skeleton className="w-10 h-4" />
            <Skeleton className="w-full h-8" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="w-10 h-4" />
            <Skeleton className="w-full h-8" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Skeleton className="w-24 h-8" />
      </CardFooter>
    </Card>
  );
}

function RevealSecret({ fetcher }: { fetcher: () => Promise<string> }) {
  const [isFetching, setIsFetching] = useState(false);
  const [secret, setSecret] = useState<string | undefined>(undefined);
  const [visible, setVisible] = useState(false);

  // useEffect(() => {
  //   if (visible) {

  //   }
  // }, [fetcher, visible]);

  const onRevealClick = async () => {
    setIsFetching(true);
    fetcher()
      .then((res) => {
        setSecret(res);
        setVisible(true);
      })
      .finally(() => {
        setIsFetching(false);
      });
  };

  const onHideClick = () => {
    setSecret(undefined);
    setVisible(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div hidden={!visible}>
        <Button size="icon" variant="ghost" onClick={onHideClick}>
          <EyeNoneIcon />
        </Button>
      </div>
      <div hidden={visible}>
        <Button size="icon" variant="ghost" onClick={onRevealClick}>
          {isFetching ? <Spinner /> : <EyeOpenIcon />}
        </Button>
      </div>
      <Input
        type={visible ? "text" : "password"}
        readOnly
        value={
          secret ||
          // dummy value for password
          "123456789"
        }
      />
    </div>
  );
}

function Spinner() {
  return (
    <div role="status">
      <svg
        aria-hidden="true"
        className="inline w-4 h-4 text-ring animate-spin fill-accent-foreground"
        viewBox="0 0 100 101"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
          fill="currentColor"
        />
        <path
          d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
          fill="currentFill"
        />
      </svg>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
