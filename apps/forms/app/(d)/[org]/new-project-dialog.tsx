"use client";

import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@uidotdev/usehooks";
import React, { useEffect, useState } from "react";

const checkname = async (org: string, name: string) => {
  const res = await fetch(
    `/private/accounts/organizations/${org}/projects/check-name`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: name }),
    }
  );
  const data = await res.json();
  return data as { ok: boolean; message: string };
};

export function CreateNewProjectDialog({
  org,
  children,
}: React.PropsWithChildren<{ org: string }>) {
  const [name, setName] = useState("");
  const [ok, setOK] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState(
    `Your project url will be https://grida.co/${org}/project-name`
  );
  const [pending, setPending] = useState(false);

  const value = useDebounce(name, 500);

  useEffect(() => {
    if (value) {
      checkname(org, value)
        .then((res) => {
          setOK(res.ok);
          setError(!res.ok);
          setMessage(res.message);
        })
        .finally(() => {
          setPending(false);
        });
    }
  }, [value]);

  useEffect(() => {
    if (!name) return;
    setPending(true);
  }, [name]);

  const valid = ok && !error && !pending && name.length > 0;

  return (
    <Dialog>
      <DialogTrigger>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new project</DialogTitle>
          <DialogDescription>
            Projects are where your files and integrations will be managed
          </DialogDescription>
        </DialogHeader>
        <form
          action={`/private/accounts/organizations/${org}/new`}
          method="post"
          id="new-project"
        >
          <div className="grid gap-2">
            <Label htmlFor="name">Project name</Label>
            <div className="relative">
              <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center">
                {pending && (
                  <Spinner className="inline me-2 align-middle w-2 h-2" />
                )}
              </div>
              <Input
                id="name"
                name="name"
                required
                placeholder="project-name"
                autoComplete="off"
                pattern="^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <span
              data-error={error}
              className="text-muted-foreground text-sm data-[error='true']:text-destructive"
            >
              {message}
            </span>
          </div>
        </form>
        <DialogFooter>
          <DialogClose>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          <Button form="new-project" disabled={!valid}>
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
