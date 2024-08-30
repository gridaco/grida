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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CodeIcon,
  EyeNoneIcon,
  EyeOpenIcon,
  LockClosedIcon,
  OpenInNewWindowIcon,
  PlusCircledIcon,
  PlusIcon,
  QuestionMarkCircledIcon,
  TableIcon,
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
import { GridaXSupabase } from "@/types";
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
import { XSupabasePrivateApiTypes } from "@/types/private/api";
import { Sector, SectorHeader, SectorHeading } from "@/components/preferences";
import { Badge } from "@/components/ui/badge";
import { useDialogState } from "@/components/hooks/use-dialog-state";

type SchemaDefinitions = {
  [schema: string]: SupabasePostgRESTOpenApi.SupabasePublicSchema;
};

export default function ConnectSupabasePage() {
  return (
    <main className="max-w-2xl mx-auto mt-10">
      <ConnectSupabase />
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
  const parsing = SupabasePostgRESTOpenApi.fetch_supabase_postgrest_openapi_doc(
    {
      url,
      anonKey,
      schemas: [schema_name],
    }
  );

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

function ConnectSupabase() {
  const [state] = useEditorState();
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [schemaNames, setSchemaNames] = useState<string[]>(["public"]);
  const [schema_definitions, set_schema_definitions] =
    useState<SchemaDefinitions | null>(null);
  const [xsbproject, setXSBProject] = useState<
    GridaXSupabase.SupabaseProject | null | undefined
  >(undefined);

  const {
    supabase_project: existing_connection,
    form,
    doctype,
    project: { id: project_id },
  } = state;

  const is_loaded = schema_definitions !== null;
  const is_connected = !!xsbproject;

  const disabled = !url || !anonKey;

  useEffect(() => {
    const ondata = (data: XSupabasePrivateApiTypes.GetSupabaseProjectData) => {
      setXSBProject(data);
      setUrl(data.sb_project_url);
      setAnonKey(data.sb_anon_key);
      setSchemaNames(data.sb_schema_names);
      set_schema_definitions(data.sb_schema_definitions as {});
    };

    if (!existing_connection) {
      PrivateEditorApi.XSupabase.getXSBProjectByGridaProjectId(project_id)
        .then((res) => {
          const data = res.data.data;
          ondata(data);
        })
        .catch((err) => {
          setXSBProject(null);
        });
      return;
    }

    PrivateEditorApi.XSupabase.getXSBProject(existing_connection.id)
      .then((res) => {
        const data = res.data.data;
        ondata(data);
      })
      .catch((err) => {
        setXSBProject(null);
      });
  }, [project_id, existing_connection]);

  const onClearClick = () => {
    setUrl("");
    setAnonKey("");
    set_schema_definitions(null);
    setXSBProject(null);
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

  const onRefreshSchemaClick = async () => {
    const res = PrivateEditorApi.XSupabase.refreshXSBProjectSchema(
      xsbproject!.id
    );
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
    const res = PrivateEditorApi.XSupabase.createXSBProjectConnection({
      project_id: project_id,
      sb_anon_key: anonKey,
      sb_project_url: url,
    });

    toast
      .promise(res, {
        loading: "Creating Connection...",
        success: "Connection Created",
        error: "Failed to create connection",
      })
      .then((res) => {
        setXSBProject(res.data.data);
      });
  };

  const onRemoveConnectionClick = async () => {
    const res = PrivateEditorApi.XSupabase.deleteXSBProjectConnection(
      xsbproject!.id
    );

    toast
      .promise(res, {
        loading: "Removing Connection...",
        success: "Connection Removed",
        error: "Failed to remove connection",
      })
      .then(() => {
        setXSBProject(null);
        setUrl("");
        setAnonKey("");
        set_schema_definitions(null);
      });
  };

  return (
    <div className="space-y-10">
      {xsbproject === undefined ? (
        <LoadingCard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                <SupabaseLogo className="w-5 h-5 inline me-2 align-middle" />
                Connect Supabase
              </span>
              {is_connected && (
                <div className="flex gap-2">
                  <Link
                    href={SupabasePostgRESTOpenApi.build_supabase_openapi_url(
                      url,
                      anonKey
                    )}
                    target="_blank"
                  >
                    <Button variant="link">
                      <OpenInNewWindowIcon className="inline me-2 align-middle" />
                      OpenAPI
                    </Button>
                  </Link>
                  <Link
                    href={`https://supabase.com/dashboard/project/${xsbproject.sb_project_reference_id}`}
                    target="_blank"
                  >
                    <Button variant="link">
                      <OpenInNewWindowIcon className="inline me-2 align-middle" />
                      Dashboard
                    </Button>
                  </Link>
                </div>
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
                      Remove Connection across Project
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action is irreversible. Please make sure there is no
                      active reference to this connection.
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
      {xsbproject && (
        <ConnectServiceRoleKey
          sb_service_key_id={xsbproject.sb_service_key_id}
          on_service_key_id_change={(sb_service_key_id: string) => {
            setXSBProject((prev) => ({
              ...prev!,
              sb_service_key_id,
            }));
          }}
          connection={{
            supabase_project_id: xsbproject.id,
            sb_project_url: xsbproject.sb_project_url,
          }}
        />
      )}
      {xsbproject && (
        <ConnectSchema
          connection={{
            supabase_project_id: xsbproject.id,
            sb_project_url: xsbproject.sb_project_url,
            sb_schema_definitions: schema_definitions!,
            sb_schema_names: schemaNames,
            sb_anon_key: anonKey,
          }}
          on_schema_names_change={setSchemaNames}
          on_schema_definitions_change={set_schema_definitions}
        />
      )}
      {xsbproject && doctype === "v0_form" && (
        <>
          <hr />
          <Sector>
            <SectorHeader>
              <SectorHeading>Forms Table</SectorHeading>
            </SectorHeader>
            <ConnectFormXSupabaseTable
              form_id={form.form_id}
              connection={{
                supabase_project_id: xsbproject.id,
                sb_project_url: xsbproject.sb_project_url,
                sb_schema_definitions: schema_definitions!,
                sb_schema_names: schemaNames,
                sb_anon_key: anonKey,
              }}
              on_schema_names_change={setSchemaNames}
              on_schema_definitions_change={set_schema_definitions}
            />
          </Sector>
        </>
      )}
    </div>
  );
}

function ConnectServiceRoleKey({
  connection,
  sb_service_key_id,
  on_service_key_id_change,
}: {
  connection: {
    supabase_project_id: number;
    sb_project_url: string;
  };
  sb_service_key_id: string | null;
  on_service_key_id_change: (sb_service_key_id: string) => void;
}) {
  const [serviceKey, setServiceKey] = useState("");
  const is_service_key_set = !!sb_service_key_id;

  const onServiceKeySaveClick = async () => {
    // validate service key
    // ping test
    // TODO: to verify service_role key, we need to make a request to administartion api (below would only verify if the key is valid, not if it has the correct permissions)
    ping({
      url: SupabasePostgRESTOpenApi.build_supabase_rest_url(
        connection.sb_project_url
      ),
      key: serviceKey,
    }).then((res) => {
      if (res.status === 200) {
        // create secret key connection
        const data = {
          secret: serviceKey,
        };

        const res = PrivateEditorApi.XSupabase.createXSBProjectServiceRoleKey(
          connection.supabase_project_id,
          data
        );

        res.then((res) => {
          on_service_key_id_change(res.data.data);
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

  return (
    <Card>
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
                This key has the ability to bypass Row Level Security. We never
                use this key on the client side. Only opt-in functions will use
                this key to perform the request
              </TooltipContent>
            </Tooltip>
          </Label>
          <div>
            {is_service_key_set ? (
              <>
                <RevealSecret
                  fetcher={async () => {
                    const res =
                      await PrivateEditorApi.XSupabase.revealXSBProjectServiceRoleKey(
                        connection.supabase_project_id
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
        <div hidden={!!sb_service_key_id}>
          <Button disabled={!serviceKey} onClick={onServiceKeySaveClick}>
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function ConnectSchema({
  connection,
  on_schema_names_change,
  on_schema_definitions_change,
}: {
  connection: {
    supabase_project_id: number;
    sb_project_url: string;
    sb_anon_key: string;
    sb_schema_names: string[];
    sb_schema_definitions: SchemaDefinitions;
  };
  on_schema_names_change: (schema_names: string[]) => void;
  on_schema_definitions_change: (schema_definitions: SchemaDefinitions) => void;
}) {
  const newCustomSchemaDialog = useDialogState();
  const {
    supabase_project_id,
    sb_project_url,
    sb_anon_key,
    sb_schema_names,
    sb_schema_definitions,
  } = connection;
  const onTestCustomSchemaConnection = async (schema: string) => {
    return await testSupabaseConnection({
      url: sb_project_url,
      anonKey: sb_anon_key,
      schema_name: schema,
    });
  };

  const onUseCustomSchema = async (schema: string) => {
    const { data } = await PrivateEditorApi.XSupabase.registerXSBCustomSchema(
      supabase_project_id,
      {
        schema_name: schema,
      }
    );

    if (data.data) {
      on_schema_names_change(data.data.sb_schema_names);
      on_schema_definitions_change(data.data.sb_schema_definitions as {});
      return data.data;
    }
  };

  return (
    <>
      <NewCustomSchemaDialog
        {...newCustomSchemaDialog}
        onUse={onUseCustomSchema}
        onTestConnection={onTestCustomSchemaConnection}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <SupabaseLogo className="inline me-2 align-middle w-5 h-5" />
            DB Schemas
          </CardTitle>
          <CardDescription>
            Register custom schema if your main db schema is other than public.{" "}
            <Link
              href="https://supabase.com/docs/guides/api/using-custom-schemas"
              target="_blank"
              className="underline"
            >
              Learn More
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {sb_schema_names.map((schema) => (
              <Badge key={schema} variant="outline" className="font-mono">
                {schema}
              </Badge>
            ))}
            <Badge
              variant="default"
              className="font-mono cursor-pointer"
              onClick={() => {
                newCustomSchemaDialog.openDialog();
              }}
            >
              <PlusCircledIcon className="me-2" />
              Add Custom Schema
            </Badge>
          </div>
          <Collapsible className="mt-4">
            <CollapsibleTrigger>
              <Button variant="link" size="sm">
                <CodeIcon className="me-2 align-middle" /> View Details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {Object.keys(sb_schema_definitions).map((schema) => {
                const tables = sb_schema_definitions[schema];
                return (
                  <div key={schema} className="mt-10 space-y-10">
                    {Object.keys(tables).map((table) => {
                      return (
                        <div key={table}>
                          <Label>
                            <TableIcon className="me-2 inline-flex" />
                            {schema}.{table}
                          </Label>
                          <SupabaseTableInfo
                            table={tables[table] as GridaXSupabase.JSONSChema}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </>
  );
}

function ConnectFormXSupabaseTable({
  form_id,
  connection,
  on_schema_names_change,
  on_schema_definitions_change,
}: {
  form_id: string;
  connection: {
    supabase_project_id: number;
    sb_project_url: string;
    sb_anon_key: string;
    sb_schema_names: string[];
    sb_schema_definitions: SchemaDefinitions;
  };
  on_schema_names_change: (schema_names: string[]) => void;
  on_schema_definitions_change: (schema_definitions: SchemaDefinitions) => void;
}) {
  const [state] = useEditorState();
  const {
    connections: { supabase: forms_supabase_connection },
  } = state;

  const {
    supabase_project_id,
    sb_schema_definitions,
    sb_schema_names: sb_schema_names,
    sb_project_url,
    sb_anon_key,
  } = connection;
  const [schemaName, setSchemaName] = useState<string>("public");
  const [tableName, setTableName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (schemaName) {
      setTableName(undefined);
    }
  }, [schemaName]);

  useEffect(() => {
    if (forms_supabase_connection?.main_supabase_table) {
      setTableName(
        forms_supabase_connection?.main_supabase_table?.sb_table_name
      );
      setSchemaName(
        forms_supabase_connection?.main_supabase_table?.sb_schema_name as string
      );
    }
  }, [forms_supabase_connection?.main_supabase_table]);

  const onUseCustomSchema = async (schema: string) => {
    const { data } = await PrivateEditorApi.XSupabase.registerXSBCustomSchema(
      supabase_project_id,
      {
        schema_name: schema,
      }
    );

    if (data.data) {
      setSchemaName(schema);
      on_schema_names_change(data.data.sb_schema_names);
      on_schema_definitions_change(data.data.sb_schema_definitions as {});
      return data.data;
    }
  };

  const onSaveMainTableClick = async () => {
    assert(tableName);
    const res = PrivateEditorApi.Forms.connectFormsXSBConnectionTable(form_id, {
      table_name: tableName,
      schema_name: schemaName,
    });

    toast.promise(res, {
      loading: "Saving Main Table...",
      success: "Main Table Saved",
      error: "Failed to save main table",
    });
  };

  const onTestCustomSchemaConnection = async (schema: string) => {
    return await testSupabaseConnection({
      url: sb_project_url,
      anonKey: sb_anon_key,
      schema_name: schema,
    });
  };

  return (
    <>
      <Card>
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
                options={sb_schema_names}
                onChange={setSchemaName}
                onUse={onUseCustomSchema}
              />
            </Label>
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
                    {Object.keys(sb_schema_definitions[schemaName]).map(
                      (key) => (
                        <SelectItem key={key} value={key}>
                          {schemaName}.{key}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </Label>

              {tableName && sb_schema_definitions[schemaName][tableName] && (
                <SupabaseTableInfo
                  table={
                    sb_schema_definitions[schemaName][
                      tableName
                    ] as GridaXSupabase.JSONSChema
                  }
                />
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button disabled={!tableName} onClick={onSaveMainTableClick}>
            Save
          </Button>
        </CardFooter>
      </Card>
    </>
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
  const [open, setOpen] = useState(false);

  const __add_custom = "__add_custom";

  return (
    <>
      <NewCustomSchemaDialog
        open={open}
        onOpenChange={setOpen}
        onUse={onUse}
        onTestConnection={onTestConnection}
      />
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
            Register custom schema
          </SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

function NewCustomSchemaDialog({
  onUse,
  onTestConnection,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onUse: (schema: string) => Promise<false | any>;
  onTestConnection: (schema: string) => Promise<false | any>;
}) {
  const [isvalid, setIsValid] = useState(false);
  const [testing, setTesting] = useState(false);
  const [custom, setCustom] = useState("");

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
          props.onOpenChange?.(false);
        }
      })
      .finally(() => {
        setTesting(false);
      });
  };

  return (
    <Dialog {...props}>
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
