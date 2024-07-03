"use client";

import React, { useState, useEffect } from "react";
import { GridaLogo } from "@/components/grida-logo";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@uidotdev/usehooks";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";

const checkname = async (name: string) => {
  const res = await fetch("/private/accounts/organizations/check-name", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: name }),
  });
  const data = await res.json();
  return data as { ok: boolean; message: string };
};

export default function NewOrganizationSetupPage({
  searchParams,
}: {
  searchParams: {
    error?: string;
  };
}) {
  const [name, setName] = useState("");
  const [ok, setOK] = useState(false);
  const [error, setError] = useState(!!searchParams.error);
  const [message, setMessage] = useState(
    searchParams.error
      ? searchParams.error
      : "This will be the url of your account on Grida."
  );
  const [pending, setPending] = useState(false);

  const value = useDebounce(name, 500);

  useEffect(() => {
    if (value) {
      checkname(value)
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
    <main className="max-w-md mx-auto p-4 md:p-0">
      <Nav />
      <header className="text-center py-20">
        <span className="text-muted-foreground text-sm">
          Tell us about your organization
        </span>
        <h1 className="text-xl font-bold">Set up your organization</h1>
      </header>
      <form
        action={`/private/accounts/organizations/new`}
        method="post"
        className="flex flex-col gap-8"
      >
        <div className="grid gap-2">
          <Label htmlFor="name">Organization name</Label>
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
              placeholder="your-organization-name"
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
        <div className="grid gap-2">
          <Label htmlFor="email">Contact email</Label>
          <Input
            id="email"
            name="email"
            required
            placeholder="Organization name"
            pattern="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
            //
          />
          <span className="text-muted-foreground text-sm">
            This will be the name of your account on Grida.
          </span>
        </div>
        <footer className="w-full py-10 border-t">
          <Submit disabled={!valid} />
        </footer>
      </form>
      {/*  */}
    </main>
  );
}

function Submit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      disabled={disabled || pending}
      className="w-full disabled:cursor-not-allowed"
    >
      Next
    </Button>
  );
}

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 w-full p-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <Link href="/">
              <GridaLogo className="w-4 h-4" />
            </Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <Link href="/organizations">organizations</Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>new</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>
      <nav></nav>
    </header>
  );
}
