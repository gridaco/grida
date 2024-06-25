"use client";
import React, { useEffect, useMemo, useState } from "react";
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
  OpenInNewWindowIcon,
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
import { SupabasePostgRESTOpenApi, ping } from "@/lib/supabase-postgrest";
import { GridaSupabase } from "@/types";
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
import { Spinner } from "@/components/spinner";
import { PrivateEditorApi } from "@/lib/private";
import { KeyIcon, LinkIcon } from "lucide-react";

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

function ConnectSupabase({ form_id }: { form_id: string }) {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [schema, setSchema] =
    useState<SupabasePostgRESTOpenApi.SupabasePublicSchema | null>(null);
  const [table, setTable] = useState<string | undefined>(undefined);

  const [project, setProject] = useState<
    GridaSupabase.SupabaseProject | null | undefined
  >(undefined);

  const is_loaded = schema !== null;
  const is_connected = !!project;
  const is_service_key_set = !!project?.sb_service_key_id;

  const disabled = !url || !anonKey;

  useEffect(() => {
    PrivateEditorApi.SupabaseConnection.getConnection(form_id)
      .then((res) => {
        const data = res.data.data;
        setProject(data.supabase_project);
        setUrl(data.supabase_project.sb_project_url);
        setAnonKey(data.supabase_project.sb_anon_key);
        setSchema(data.supabase_project.sb_public_schema as {});
        setTable(
          data.tables.find((t) => t.id === data.main_supabase_table_id)
            ?.sb_table_name
        );
        console.log(data);
      })
      .catch((err) => {
        setProject(null);
      });
  }, [form_id]);

  const onClearClick = () => {
    setUrl("");
    setAnonKey("");
    setSchema(null);
    setTable(undefined);
    setProject(null);
  };

  const onTestConnectionClick = async () => {
    const parsing = SupabasePostgRESTOpenApi.fetch_supabase_postgrest_swagger({
      url,
      anonKey,
    }).then((res) => {
      setSchema(res.sb_public_schema);
    });

    toast
      .promise(parsing, {
        loading: "Parsing OpenAPI...",
        success: "Valid Connection",
        error: "Failed to connect to Supabase",
      })
      .catch(console.error);
  };

  const onRefreshSchemaClick = async () => {
    const res = PrivateEditorApi.SupabaseConnection.refreshConnection(form_id);
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

    const res = PrivateEditorApi.SupabaseConnection.createConnection(
      form_id,
      data
    );

    toast
      .promise(res, {
        loading: "Creating Connection...",
        success: "Connection Created",
        error: "Failed to create connection",
      })
      .then((res) => {
        setProject(res.data.data);
      });
  };

  const onRemoveConnectionClick = async () => {
    const res = PrivateEditorApi.SupabaseConnection.removeConnection(form_id);

    toast
      .promise(res, {
        loading: "Removing Connection...",
        success: "Connection Removed",
        error: "Failed to remove connection",
      })
      .then(() => {
        setProject(null);
        setUrl("");
        setAnonKey("");
        setSchema(null);
        setTable(undefined);
      });
  };

  const onServiceKeySaveClick = async () => {
    // validate service key
    // ping test
    // TODO: to verify service_role key, we need to make a request to administartion api (below would only verify if the key is valid, not if it has the correct permissions)
    ping({
      url: SupabasePostgRESTOpenApi.build_supabase_rest_url(url),
      key: serviceKey,
    }).then((res) => {
      if (res.status === 200) {
        // create secret key connection
        const data = {
          secret: serviceKey,
        };

        const res = PrivateEditorApi.SupabaseConnection.createSecret(
          form_id,
          data
        );

        res.then((res) => {
          setProject((prev) => ({
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
    const res = PrivateEditorApi.SupabaseConnection.createConnectionTable(
      form_id,
      { table }
    );

    toast.promise(res, {
      loading: "Saving Main Table...",
      success: "Main Table Saved",
      error: "Failed to save main table",
    });
  };

  console.log(schema, table);

  return (
    <div className="space-y-10">
      {project === undefined ? (
        <LoadingCard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                <SupabaseLogo size={20} className="inline me-2 align-middle" />
                Connect Supabase
              </span>
              {is_connected && (
                <Link
                  href={`https://supabase.com/dashboard/project/${project.sb_project_reference_id}`}
                  target="_blank"
                >
                  <Button variant="link">
                    <OpenInNewWindowIcon className="inline me-2 align-middle" />
                    Dashboard
                  </Button>
                </Link>
              )}
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
                    autoComplete="off"
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
                      const res =
                        await PrivateEditorApi.SupabaseConnection.revealSecret(
                          form_id
                        );
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
          <div hidden={!!project?.sb_service_key_id}>
            <Button disabled={!serviceKey} onClick={onServiceKeySaveClick}>
              Save
            </Button>
          </div>
        </CardFooter>
      </Card>
      <Card hidden={!is_connected}>
        <CardHeader>
          <CardTitle>Main Table Connection</CardTitle>
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
                <SupabaseTableInfo
                  table={schema[table] as GridaSupabase.JSONSChema}
                />
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

function SupabaseTableInfo({ table }: { table: GridaSupabase.JSONSChema }) {
  const parsed = useMemo(
    () =>
      SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definitions(
        table
      ),
    [table]
  );

  return (
    <>
      <hr className="my-4" />
      <Table className="font-mono">
        <TableHeader>
          <TableRow>
            <TableHead></TableHead>
            <TableHead>Column</TableHead>
            <TableHead>Data Type</TableHead>
            <TableHead>PostgreSQL Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(parsed).map(
            ([prop, { pk, fk, type, format, required, name }]) => {
              return (
                <TableRow key={prop}>
                  <TableCell>
                    {pk && (
                      <KeyIcon className="me-1 inline align-middle w-4 h-4" />
                    )}
                    {fk && (
                      <LinkIcon className="me-1 inline align-middle w-4 h-4" />
                    )}
                  </TableCell>
                  <TableCell>
                    {name}{" "}
                    {required && (
                      <span className="text-xs text-foreground-muted text-red-500">
                        *
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{type}</TableCell>
                  <TableCell>{format}</TableCell>
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
            <pre>{JSON.stringify(table, null, 2)}</pre>
          </article>
        </CollapsibleContent>
      </Collapsible>
    </>
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
          // its usually 219 characters long
          "·".repeat(219)
        }
      />
    </div>
  );
}
