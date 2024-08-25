"use client";
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
  EyeNoneIcon,
  EyeOpenIcon,
  LockClosedIcon,
  OpenInNewWindowIcon,
  PlusIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import toast from "react-hot-toast";
import { SupabaseLogo } from "@/components/logos";
import Link from "next/link";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SupabaseTableInfo } from "@/scaffolds/x-supabase/supabase-table-info";
import { useEditorState } from "@/scaffolds/editor";

export default function ConnectSupabasePage() {
  const [state] = useEditorState();
  const { form_id } = state;

  return (
    <main className="max-w-2xl mx-auto mt-10">
      <ConnectSupabase form_id={form_id} />
    </main>
  );
}

const testSupabaseConnection = async ({
  url,
  anonKey,
  schema_name,
}: {
  url: string;
  anonKey: string;
  schema_name: string;
}) => {
  //
  const parsing = SupabasePostgRESTOpenApi.fetch_supabase_postgrest_swagger({
    url,
    anonKey,
    schemas: [schema_name],
  });

  try {
    await toast
      .promise(parsing, {
        loading: "Testing...",
        success: "Valid Connection",
        error: "Failed to connect to Supabase",
      })
      .catch(console.error);

    return await parsing;
  } catch (e) {
    return false;
  }
};

function ConnectSupabase({ form_id }: { form_id: string }) {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [schemaNames, setSchemaNames] = useState<string[]>(["public"]);
  const [schemaName, setSchemaName] = useState<string>("public");
  const [schema_definitions, set_schema_definitions] = useState<{
    [schema: string]: SupabasePostgRESTOpenApi.SupabasePublicSchema;
  } | null>(null);
  const [tableName, setTableName] = useState<string | undefined>(undefined);

  const [project, setProject] = useState<
    GridaSupabase.SupabaseProject | null | undefined
  >(undefined);

  const is_loaded = schema_definitions !== null;
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
        setSchemaNames(data.supabase_project.sb_schema_names);
        if (data.main_supabase_table?.sb_schema_name) {
          setSchemaName(data.main_supabase_table.sb_schema_name as string);
        }
        set_schema_definitions(
          data.supabase_project.sb_schema_definitions as {}
        );
        setTableName(
          data.tables.find((t) => t.id === data.main_supabase_table_id)
            ?.sb_table_name
        );
      })
      .catch((err) => {
        setProject(null);
      });
  }, [form_id]);

  useEffect(() => {
    setTableName(undefined);
  }, [schemaName]);

  const onClearClick = () => {
    setUrl("");
    setAnonKey("");
    set_schema_definitions(null);
    setTableName(undefined);
    setProject(null);
  };

  const onTestConnectionClick = async () => {
    await testSupabaseConnection({
      url,
      anonKey,
      schema_name: "public",
    }).then((res) => {
      if (res) set_schema_definitions(res.sb_schema_definitions as {});
    });
  };

  const onTestCustomSchemaConnection = async (schema: string) => {
    return await testSupabaseConnection({
      url,
      anonKey,
      schema_name: schema,
    });
  };

  const onUseCustomSchema = async (schema: string) => {
    const { data } = await PrivateEditorApi.SupabaseConnection.addCustomSchema(
      form_id,
      {
        schema_name: schema,
      }
    );

    if (data.data) {
      setSchemaName(schema);
      setSchemaNames(data.data.sb_schema_names);
      set_schema_definitions(data.data.sb_schema_definitions as {});
      return data.data;
    }
  };

  const onRefreshSchemaClick = async () => {
    const res = PrivateEditorApi.SupabaseConnection.refreshConnection(form_id);
    toast.promise(res, {
      loading: "Refreshing Schema...",
      success: "Schema Refreshed",
      error: "Failed to refresh schema",
    });

    res.then((res) => {
      set_schema_definitions(res.data.data?.sb_schema_definitions as {});
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
        set_schema_definitions(null);
        setTableName(undefined);
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
    assert(tableName);
    const res = PrivateEditorApi.SupabaseConnection.createConnectionTable(
      form_id,
      {
        table_name: tableName,
        schema_name: schemaName,
      }
    );

    toast.promise(res, {
      loading: "Saving Main Table...",
      success: "Main Table Saved",
      error: "Failed to save main table",
    });
  };

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
          <div className="space-y-4">
            <Label>
              Schema
              <DBSchemaSelect
                onTestConnection={onTestCustomSchemaConnection}
                value={schemaName}
                options={schemaNames}
                onChange={setSchemaName}
                onUse={onUseCustomSchema}
              />
            </Label>
            {schema_definitions && (
              <div>
                <Label>
                  Table
                  <Select
                    value={tableName}
                    onValueChange={(value) => setTableName(value)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={`Select table from schema: ${schemaName}`}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(schema_definitions[schemaName]).map(
                        (key) => (
                          <SelectItem key={key} value={key}>
                            {schemaName}.{key}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </Label>

                {tableName && schema_definitions[schemaName][tableName] && (
                  <SupabaseTableInfo
                    table={
                      schema_definitions[schemaName][
                        tableName
                      ] as GridaSupabase.JSONSChema
                    }
                  />
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button disabled={!tableName} onClick={onSaveMainTableClick}>
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function DBSchemaSelect({
  value,
  options,
  onChange,
  onTestConnection,
  onUse,
}: {
  value: string;
  options: string[];
  onTestConnection: (schema: string) => Promise<false | any>;
  onChange: (schema: string) => void;
  onUse: (schema: string) => Promise<false | any>;
}) {
  const [isvalid, setIsValid] = useState(false);
  const [testing, setTesting] = useState(false);
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState(false);

  const __add_custom = "__add_custom";

  useEffect(() => {
    setIsValid(false);
  }, [custom]);

  const onTest = () => {
    setTesting(true);
    onTestConnection(custom)
      .then((res) => {
        setIsValid(!!res);
      })
      .finally(() => {
        setTesting(false);
      });
  };

  const onUseClick = () => {
    setTesting(true);
    onUse(custom)
      .then((res) => {
        if (!!res) {
          setOpen(false);
        }
      })
      .finally(() => {
        setTesting(false);
      });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <SupabaseLogo className="inline me-2 align-middle" size={20} />
              Enter Custom Schema
            </DialogTitle>
            <DialogDescription>
              Enter the schema name to connect to.{" "}
              <Link
                href="https://supabase.com/docs/guides/api/using-custom-schemas"
                target="_blank"
                className="underline"
              >
                Learn More
              </Link>
            </DialogDescription>
          </DialogHeader>
          <div>
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={testing}
              placeholder="schema_name"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            {isvalid ? (
              <Button disabled={testing} onClick={onUseClick}>
                {testing && <Spinner className="w-4 h-4 me-2 align-middle" />}
                Add this schema
              </Button>
            ) : (
              <Button disabled={testing || !custom} onClick={onTest}>
                {testing && <Spinner className="w-4 h-4 me-2 align-middle" />}
                Test Connection
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === __add_custom) {
            setOpen(true);
            return;
          }
          onChange(v);
        }}
        defaultValue="public"
      >
        <SelectTrigger>
          <SelectValue placeholder="schema" />
        </SelectTrigger>
        <SelectContent>
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
          <SelectItem value={__add_custom}>
            <PlusIcon className="me-2 inline align-middle w-4 h-4" />
            Add custom schema
          </SelectItem>
        </SelectContent>
      </Select>
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
