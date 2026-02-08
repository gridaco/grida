"use client";

import React, { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/components/lib/utils/index";
import {
  DotsHorizontalIcon,
  Pencil2Icon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { CheckCircle2, XCircle } from "lucide-react";

type DomainStatus = "pending" | "active" | "error";
type DomainKind = "apex" | "subdomain";

type DomainRow = {
  id: string;
  hostname: string;
  status: DomainStatus;
  canonical: boolean;
  kind: DomainKind;
  last_error: string | null;
  vercel: unknown | null;
};

type ApiListResponse = {
  data?: {
    www: { id: string; name: string };
    domains: DomainRow[];
  };
  error?: { code: string; message: string };
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function toHostPathSegment(hostname: string) {
  // Next.js route segment for [hostname] is a single segment, so encode dots.
  return encodeURIComponent(hostname);
}

type DnsInstruction = {
  type: string;
  name: string;
  value: string;
};

// Dub-style deterministic “base” DNS instructions.
//
// - Apex domains route to Vercel via A record.
// - Subdomains route via a CNAME. We use a branded alias (`cname.grida.co`) that
//   you configure in Grida’s own DNS (Cloudflare) as a CNAME to Vercel's target.
//
// This keeps UI stable and avoids coupling UX to provider response shapes.
const VERCEL_APEX_A_RECORD_VALUE = "76.76.21.21";
const GRIDA_VERCEL_CNAME_ALIAS = "cname.grida.co";

function dnsInstructions(domain: DomainRow): DnsInstruction[] {
  // Use provider payload when available, but always include deterministic base records:
  // - Apex: A @ -> 76.76.21.21
  // - Subdomain: CNAME <sub> -> cname.grida.co
  //
  // Important: Vercel's `verification[]` is about ownership challenges (commonly TXT),
  // and does NOT replace the base A/CNAME routing record. So we append verification
  // records to the base instructions when present.
  const vercel = domain.vercel as unknown;
  const vercelDomain =
    vercel &&
    typeof vercel === "object" &&
    !Array.isArray(vercel) &&
    "domain" in vercel
      ? ((vercel as { domain?: unknown }).domain as
          | { name?: string; apexName?: string; verification?: unknown[] }
          | undefined)
      : undefined;

  const fqdn = String(vercelDomain?.name ?? domain.hostname);
  const apexName = String(
    vercelDomain?.apexName ?? fqdn.split(".").slice(-2).join(".")
  );

  const nameRelativeToApex =
    fqdn === apexName
      ? "@"
      : fqdn.endsWith(`.${apexName}`)
        ? fqdn.slice(0, -1 * `.${apexName}`.length)
        : (fqdn.split(".")[0] ?? "@");

  const base: DnsInstruction[] =
    domain.kind === "apex"
      ? [{ type: "A", name: "@", value: VERCEL_APEX_A_RECORD_VALUE }]
      : [
          {
            type: "CNAME",
            name: nameRelativeToApex,
            value: GRIDA_VERCEL_CNAME_ALIAS,
          },
        ];

  const verification = vercelDomain?.verification;
  const provider: DnsInstruction[] = Array.isArray(verification)
    ? verification
        .map((v: unknown) => {
          if (!v || typeof v !== "object" || Array.isArray(v)) return null;
          const o = v as Record<string, unknown>;
          const type = o.type ?? o.recordType ?? o.kind ?? "DNS";
          const name = o.domain ?? o.name ?? o.recordName ?? "@";
          const value = o.value ?? o.target ?? o.expectedValue ?? "";
          return {
            type: String(type).toUpperCase(),
            name: String(name),
            value: String(value),
          } satisfies DnsInstruction;
        })
        .filter((x): x is DnsInstruction =>
          Boolean(x?.type && x?.name && x?.value)
        )
    : [];

  // Dedupe.
  const out: DnsInstruction[] = [];
  const seen = new Set<string>();
  for (const r of [...base, ...provider]) {
    const key = `${r.type}|${r.name}|${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  return out;
}

function StatusIcon({ status }: { status: DomainStatus }) {
  switch (status) {
    case "active":
      return <CheckCircle2 className="size-4 text-emerald-600" />;
    case "pending":
      // Not verified yet.
      return <XCircle className="size-4 text-amber-600" />;
    case "error":
      return <XCircle className="size-4 text-destructive" />;
  }
}

export function CustomDomainsSection({
  org,
  proj,
  platformName,
  platformDomain,
  onPlatformNameChange,
}: {
  org: string;
  proj: string;
  platformName: string; // e.g. "tenant"
  platformDomain: string; // e.g. "tenant.grida.site"
  onPlatformNameChange: (name: string) => Promise<boolean>;
}) {
  const apiBase = useMemo(
    () => `/private/~/${org}/${proj}/www/domains`,
    [org, proj]
  );

  const { data, isLoading } = useSWR<ApiListResponse>(apiBase, fetcher);

  const domains = data?.data?.domains ?? [];
  const activeCanonical = domains.find(
    (d) => d.canonical === true && d.status === "active"
  );
  const primaryHostname = activeCanonical?.hostname ?? platformDomain;

  const [hostname, setHostname] = useState("");
  const [setAsCanonical, setSetAsCanonical] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState<Record<string, boolean>>({});

  const refresh = () => mutate(apiBase);

  const addDomain = async () => {
    setBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname,
          canonical: setAsCanonical,
        }),
      });
      const json = (await res.json()) as ApiListResponse;
      if (!res.ok) {
        toast.error(json.error?.message ?? "Failed to add domain");
        return;
      }
      toast.success("Domain added. Configure DNS, then refresh.");
      setHostname("");
      setAddOpen(false);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const refreshDomain = async (h: string) => {
    setRefreshing((prev) => ({ ...prev, [h]: true }));
    try {
      const res = await fetch(`${apiBase}/${toHostPathSegment(h)}/refresh`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Refresh failed");
        return;
      }
      toast.success("Domain refreshed");
      refresh();
    } finally {
      setRefreshing((prev) => ({ ...prev, [h]: false }));
    }
  };

  const setCanonical = async (h: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/${toHostPathSegment(h)}/canonical`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Failed to set canonical domain");
        return;
      }
      toast.success("Canonical domain updated");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const setPlatformPrimary = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/platform/canonical`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Failed to set platform as primary");
        return;
      }
      toast.success("Primary domain updated");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleSetup = (h: string) => {
    setSetupOpen((prev) => ({ ...prev, [h]: !prev[h] }));
  };

  const removeDomain = async (h: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/${toHostPathSegment(h)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Failed to remove domain");
        return;
      }
      toast.success("Domain removed");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">Domains</div>
          <div className="text-xs text-muted-foreground">
            Add custom domains and choose the primary one.
          </div>
        </div>
        <div className="flex items-center">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={busy}>
                <PlusIcon className="me-2" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add domain</DialogTitle>
                <DialogDescription>
                  Add an apex domain (example.com) or subdomain
                  (app.example.com). Configure DNS, then refresh until it
                  becomes active.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <Field>
                  <FieldLabel>Hostname</FieldLabel>
                  <Input
                    value={hostname}
                    disabled={busy}
                    placeholder="example.com or app.example.com"
                    onChange={(e) => setHostname(e.target.value)}
                  />
                  <FieldDescription>
                    Do not include protocol (https://) or paths.
                  </FieldDescription>
                </Field>

                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/40 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label>Make primary (once active)</Label>
                    <div className="text-xs text-muted-foreground">
                      When verified, this domain becomes primary.
                    </div>
                  </div>
                  <Switch
                    checked={setAsCanonical}
                    disabled={busy}
                    onCheckedChange={(v) => setSetAsCanonical(Boolean(v))}
                  />
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm" disabled={busy}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  size="sm"
                  onClick={addDomain}
                  disabled={busy || !hostname.trim()}
                >
                  {busy ? <Spinner className="ms-2" /> : null}
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border">
        {isLoading ? (
          <div className="px-4 py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading…
            </div>
          </div>
        ) : (
          <div className="divide-y">
            <DomainListRow
              leading={
                <div className="flex flex-wrap items-center gap-2">
                  <StatusIcon status="active" />
                  <a
                    href={`https://${platformDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm hover:underline underline-offset-4"
                  >
                    {platformDomain}
                  </a>
                  {primaryHostname === platformDomain ? (
                    <Badge>primary</Badge>
                  ) : (
                    <Badge variant="secondary">platform</Badge>
                  )}
                </div>
              }
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label="Platform domain actions"
                    >
                      <DotsHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                      <Pencil2Icon className="me-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setPlatformPrimary()}
                      disabled={primaryHostname === platformDomain}
                    >
                      Make primary
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />

            {domains.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No custom domains configured.
              </div>
            ) : null}

            {domains.map((d) => {
              const records = dnsInstructions(d);
              const isPrimary = primaryHostname === d.hostname;
              const pending = d.status !== "active";
              const showSetup = pending && setupOpen[d.hostname] === true;
              const isRefreshing = refreshing[d.hostname] === true;

              return (
                <DomainListRow
                  key={d.id}
                  leading={
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusIcon status={d.status} />
                      <a
                        href={`https://${d.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm hover:underline underline-offset-4"
                      >
                        {d.hostname}
                      </a>
                      {isPrimary ? <Badge>primary</Badge> : null}
                      {!isPrimary && d.canonical ? (
                        <Badge variant="secondary">primary (once active)</Badge>
                      ) : null}
                      <Badge variant="secondary">{d.kind}</Badge>
                    </div>
                  }
                  actions={
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || isRefreshing}
                        aria-label="Refresh domain"
                        onClick={() => refreshDomain(d.hostname)}
                      >
                        {isRefreshing ? <Spinner className="me-2" /> : null}
                        Refresh
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            aria-label="Domain actions"
                          >
                            <DotsHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={() => setCanonical(d.hostname)}
                            disabled={d.status !== "active" || isPrimary}
                          >
                            Make primary
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => removeDomain(d.hostname)}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  }
                >
                  {pending ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      onClick={() => toggleSetup(d.hostname)}
                    >
                      {showSetup ? "Hide setup" : "Show setup"}
                    </button>
                  ) : null}

                  {pending && showSetup ? (
                    <DnsRecordsCard
                      records={records}
                      lastError={d.last_error}
                    />
                  ) : null}
                </DomainListRow>
              );
            })}
          </div>
        )}
      </div>

      <RenamePlatformDomainDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        defaultName={platformName}
        onSubmit={onPlatformNameChange}
      />
    </div>
  );
}

function DomainListRow({
  leading,
  actions,
  children,
  className,
}: {
  leading: React.ReactNode;
  actions: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-3 py-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">{leading}</div>
        <div className="shrink-0">{actions}</div>
      </div>
      {children ? <div className="mt-2 space-y-2 ps-6">{children}</div> : null}
    </div>
  );
}

function DnsRecordsCard({
  records,
  lastError,
}: {
  records: Array<{ type: string; name: string; value: string }>;
  lastError: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-muted/10">
      <div className="border-b bg-background/50 px-3 py-2">
        <div className="text-sm font-medium">DNS Records</div>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div className="text-xs text-muted-foreground">
          The DNS records at your provider must match the following records to
          verify and connect your domain.
        </div>

        <div className="rounded-md border bg-background">
          <div className="grid grid-cols-[90px_140px_1fr_120px] border-b px-3 py-2 text-xs text-muted-foreground">
            <div>Type</div>
            <div>Name</div>
            <div>Value</div>
            <div>Proxy</div>
          </div>
          <div className="divide-y">
            {records.map((r, idx) => (
              <div
                key={`${r.type}:${r.name}:${idx}`}
                className="grid grid-cols-[90px_140px_1fr_120px] items-center gap-3 px-3 py-2"
              >
                <div className="font-mono text-xs">{r.type}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {r.name}
                </div>
                <div className="min-w-0">
                  <CopyToClipboardInput value={r.value} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <XCircle className="size-4" />
                  Disabled
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          It might take some time for the DNS records to apply.
        </div>

        {lastError ? (
          <div className="rounded-md border bg-background px-3 py-2 text-xs text-destructive">
            {lastError}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RenamePlatformDomainDialog({
  open,
  onOpenChange,
  defaultName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => name !== defaultName, [name, defaultName]);

  const onSubmitHandler = async () => {
    setBusy(true);
    const ok = await onSubmit(name);
    setBusy(false);
    if (ok) {
      toast.success("Domain updated");
      onOpenChange(false);
    } else {
      setError(
        "This domain is either already taken or not allowed. Please try a different name using only letters, numbers, or dashes."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit platform domain</DialogTitle>
          <DialogDescription>
            This changes your {defaultName}.grida.site hostname.
          </DialogDescription>
        </DialogHeader>
        <Field className="py-2">
          <FieldLabel className="sr-only">Domain name</FieldLabel>
          <div className="flex h-9 items-center border rounded-md px-3 py-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-muted">
            <Input
              className="border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0 shadow-none"
              placeholder="your-domain"
              disabled={busy}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            <span className="ml-2 text-muted-foreground text-sm">
              .grida.site
            </span>
          </div>
          <FieldDescription
            data-error={!!error}
            className="text-xs text-muted-foreground data-[error=true]:text-destructive"
          >
            {error
              ? error
              : "lowercase letters, numbers, and dashes are allowed"}
          </FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onSubmitHandler} disabled={!dirty || busy} size="sm">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
