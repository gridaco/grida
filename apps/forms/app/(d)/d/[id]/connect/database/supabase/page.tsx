"use client";
import Axios from "axios";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  LockClosedIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import OpenAPIParser from "@readme/openapi-parser";
import type { OpenAPI } from "openapi-types";
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
import { ping } from "@/lib/postgrest/ping";

export default function ConnectDB({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const form_id = params.id;

  return (
    <main className="max-w-2xl mx-auto">
      <ConnectSupabase form_id={form_id} />
    </main>
  );
}

function build_supabase_openapi_url(url: string, apiKey: string) {
  return `${url}/rest/v1/?apikey=${apiKey}`;
}

function build_supabase_rest_url(url: string) {
  return `${url}/rest/v1/`;
}

type SupabaseOpenAPIDocument = OpenAPI.Document & {
  basePath: string;
  consumes: string[];
  definitions: {
    [key: string]: {
      properties: {
        [key: string]: {
          default?: any;
          description?: string;
          type: string;
          format: string;
        };
      };
      type: string;
      required: string[];
    };
  };
  host: string;
  parameters: any;
  produces: string[];
  schemes: string[];
  swagger: string;
};

async function sbconn_create_connection(
  form_id: string,
  data: {
    sb_anon_key: string;
    sb_project_url: string;
  }
) {
  return Axios.post(`/private/editor/connect/${form_id}/supabase`, data);
}

async function sbconn_get_connection(form_id: string) {
  return Axios.get(`/private/editor/connect/${form_id}/supabase`);
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

function ConnectSupabase({ form_id }: { form_id: string }) {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [schema, setSchema] = useState<
    SupabaseOpenAPIDocument["definitions"] | null
  >(null);
  const [table, setTable] = useState<string | undefined>(undefined);

  const [connection, setConnection] = useState<{
    sb_anon_key: string;
    sb_project_url: string;
  } | null>(null);

  const connected = connection !== null;

  const loaded = schema !== null;

  const disabled = !url || !anonKey;

  useEffect(() => {
    sbconn_get_connection(form_id).then((res) => {
      setConnection(res.data.data);
      setUrl(res.data.data.sb_project_url);
      setAnonKey(res.data.data.sb_anon_key);
      // TODO: others
    });
  }, [form_id]);

  const onClearClick = () => {
    setUrl("");
    setAnonKey("");
    setSchema(null);
    setTable(undefined);
    setConnection(null);
  };

  const onRevealServiceKeyClick = async () => {
    const res = sbconn_reveal_secret(form_id);

    toast
      .promise(res, {
        loading: "Revealing Service Key...",
        success: "Service Key Revealed",
        error: "Failed to reveal service key",
      })
      .then((res) => {
        setServiceKey(res.data.secret);
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

  const onTestConnectionClick = async () => {
    try {
      const u = new URL(url);
      const projectref = u.hostname.split(".")[0];

      OpenAPIParser.parse(
        build_supabase_openapi_url(url, anonKey),
        (error, api) => {
          if (error || !api) {
            toast.error(
              "Failed to connect to Supabase. Check your credentials and try again."
            );
            return;
          }

          const apidoc = api as SupabaseOpenAPIDocument;

          // validate
          if (apidoc.host.includes(projectref)) {
            toast.success("Valid Connection");
            console.log(apidoc);

            setSchema(apidoc.definitions);
          }
        }
      );
    } catch (error) {
      toast.error("Invalid URL");
    }
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
      });
  };

  return (
    <div className="space-y-10">
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
                  id="url"
                  name="url"
                  type="url"
                  disabled={loaded}
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
                  id="anonkey"
                  name="anonkey"
                  type="text"
                  autoComplete="off"
                  disabled={loaded}
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
          {!loaded && (
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={onTestConnectionClick}
            >
              Test Connection
            </Button>
          )}
          {loaded && !connected && (
            <Button variant="outline" onClick={onClearClick}>
              Clear
            </Button>
          )}
          {connected && (
            <Button variant="destructive" onClick={onRemoveConnectionClick}>
              Remove Connection
            </Button>
          )}
          {loaded && !connected && (
            <Button onClick={onConnectClick}>Connect</Button>
          )}
        </CardFooter>
      </Card>
      <Card hidden={!connected}>
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
            <Input
              id="service_role"
              name="service_role"
              type="password"
              placeholder="eyxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx-xxxxxxxxx"
              value={serviceKey}
              onChange={(e) => setServiceKey(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button disabled={!serviceKey} onClick={onServiceKeySaveClick}>
            Save
          </Button>
        </CardFooter>
      </Card>
      <Card hidden={!connected}>
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
          <Button
            disabled={!table}
            onClick={() => {
              console.log("save", table);
            }}
          >
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
