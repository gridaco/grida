"use client";

import React, { useState } from "react";
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
import { CodeIcon, QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import OpenAPIParser from "@readme/openapi-parser";
import type { OpenAPI } from "openapi-types";
import toast from "react-hot-toast";
import { SupabaseLogo } from "@/components/logos";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function ConnectDB() {
  return (
    <main className="max-w-2xl mx-auto">
      <ConnectSupabase />
    </main>
  );
}

function build_supabase_openapi_url(url: string, anonKey: string) {
  return `${url}/rest/v1/?apikey=${anonKey}`;
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

function ConnectSupabase() {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [schema, setSchema] = useState<
    SupabaseOpenAPIDocument["definitions"] | null
  >(null);

  const disabled = !url || !anonKey;

  const onConnectClick = async () => {
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
            toast.success("Connected to Supabase successfully");
            console.log(apidoc);

            setSchema(apidoc.definitions);
          }
        }
      );
    } catch (error) {
      toast.error("Invalid URL");
    }
  };

  return (
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
                required
                placeholder="https://your-project-ref.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="anonkey">
                Anon API Key
                <Tooltip>
                  <TooltipTrigger>
                    <QuestionMarkCircledIcon className="inline ms-2 align-middle" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    This key is safe to use in a browser if you have enabled Row
                    Level Security for your tables and configured policies.
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="anonkey"
                name="anonkey"
                type="text"
                required
                placeholder="eyxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx-xxxxxxxxx"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
              />
            </div>
          </div>
          {schema && (
            <div>
              <Tabs>
                <TabsList>
                  {Object.keys(schema).map((key) => (
                    <TabsTrigger key={key} value={key}>
                      {key}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.keys(schema).map((key) => (
                  <TabsContent key={key} value={key}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Column</TableHead>
                          <TableHead>Data Type</TableHead>
                          <TableHead>PostgreSQL Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(schema[key].properties).map(
                          ([prop, value]) => {
                            const required =
                              schema[key].required.includes(prop);
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
                          <pre>{JSON.stringify(schema[key], null, 2)}</pre>
                        </article>
                      </CollapsibleContent>
                    </Collapsible>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onConnectClick}>
          Clear Schema
        </Button>
        <Button disabled={disabled} onClick={onConnectClick}>
          Get Schema
        </Button>
      </CardFooter>
    </Card>
  );
}
