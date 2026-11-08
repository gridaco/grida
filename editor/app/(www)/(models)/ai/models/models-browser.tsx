"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import { Alert, AlertDescription } from "@app/ui/components/alert";
import { ArrowUpRight, Search } from "lucide-react";
import {
  filterModels,
  formatRate,
  kindLabels,
  kinds,
  parseFilters,
  type Filters,
  type PublicModel,
} from "@/lib/gg/public-models/catalogue";
import type { CatalogueView } from "@/lib/gg/public-models/cache";

const releaseFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const ModelCard = memo(function ModelCard({ model }: { model: PublicModel }) {
  const { gg } = model;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border p-6 [content-visibility:auto] [contain-intrinsic-size:auto_320px]">
      <div className="mb-5 flex items-center gap-3">
        {gg.card.lab.logo ? (
          <Image
            src={gg.card.lab.logo.url}
            width={96}
            height={24}
            unoptimized
            alt=""
            loading="lazy"
            className="h-6 max-w-24 object-contain dark:invert"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium"
          >
            {gg.card.lab.name.slice(0, 1)}
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          {gg.card.lab.name}
        </span>
        <Badge variant="secondary" className="ml-auto">
          {kindLabels[gg.kind]}
        </Badge>
      </div>
      <h2 className="text-lg font-medium tracking-tight">{gg.card.label}</h2>
      <code className="mt-1 break-all text-xs text-muted-foreground">
        {model.id}
      </code>
      {gg.card.description ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {gg.card.description}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {gg.input_modalities.length ? (
          <span className="text-xs text-muted-foreground">
            {gg.input_modalities.join(", ")} <span aria-label="to">→</span>{" "}
            {gg.output_modalities.join(", ")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Outputs {gg.output_modalities.join(", ")}
          </span>
        )}
      </div>
      <details className="mt-5 border-t pt-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Usage pricing{" "}
          <span className="font-normal text-muted-foreground">
            · {gg.pricing.components.length}{" "}
            {gg.pricing.components.length === 1 ? "rate" : "rates"}
          </span>
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {gg.pricing.measurement}
        </p>
        {gg.pricing_context === "operation_input" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Rates are selected by operation and input. See the operation schema
            before submitting.
          </p>
        ) : null}
        <div className="mt-3 space-y-3">
          {gg.pricing.components.map((rate) => (
            <div key={rate.id} className="rounded-md bg-muted/50 p-3">
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="break-all">
                  {rate.meter.replaceAll("_", " ")}
                </span>
                <strong className="font-mono font-medium">
                  {formatRate(rate)}
                </strong>
              </div>
              <p className="mt-1 break-all text-[11px] text-muted-foreground">
                {rate.id}
              </p>
              {rate.quantity_range ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {rate.quantity_range.meter.replaceAll("_", " ")}: ≥{" "}
                  {rate.quantity_range.min}
                  {rate.quantity_range.max
                    ? ` and < ${rate.quantity_range.max}`
                    : ""}
                </p>
              ) : null}
              {rate.quantity_rounding.mode === "ceil" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Quantity rounded up in increments of{" "}
                  {rate.quantity_rounding.increment}.
                </p>
              ) : null}
              {Object.keys(rate.when).length ? (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Applies when</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(rate.when, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          ))}
        </div>
        {gg.operation_ids.length ? (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer">
              Operations ({gg.operation_ids.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {gg.operation_ids.map((id) => (
                <li key={id}>
                  <a
                    href={`https://gateway.grida.ai/v1/endpoints/${encodeURIComponent(id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline underline-offset-4"
                  >
                    {id}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </details>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6 text-xs text-muted-foreground">
        {gg.card.release.date ? (
          <a href={gg.card.release.source_url} target="_blank" rel="noreferrer">
            Released{" "}
            <time dateTime={gg.card.release.date}>
              {releaseFormatter.format(
                new Date(`${gg.card.release.date}T00:00:00Z`)
              )}
            </time>
          </a>
        ) : (
          <span>Release date unavailable</span>
        )}
        <a
          href={`https://gateway.grida.ai/v1/models/${model.id.split("/").map(encodeURIComponent).join("/")}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          API details <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
      </div>
      {gg.availability_ends_on ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Available until {gg.availability_ends_on} (UTC).
        </p>
      ) : null}
    </article>
  );
});

export function ModelsBrowser({
  initial,
  initialFilters,
}: {
  initial: CatalogueView;
  initialFilters: Filters;
}) {
  const [view, setView] = useState(initial);
  const [filters, setFilters] = useState(initialFilters);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    controller.current = new AbortController();
    try {
      const response = await fetch("/ai/models/feed", {
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.any([
          controller.current.signal,
          AbortSignal.timeout(10_000),
        ]),
      });
      const next: CatalogueView = await response.json();
      if (
        next.state === "fresh" ||
        next.state === "stale" ||
        next.state === "unavailable"
      )
        setView(next);
      else throw new Error("Invalid catalogue view");
    } catch {
      setView((current) => ({
        ...current,
        state: current.catalogue ? "stale" : "unavailable",
        refresh_at: Date.now() + 10_000,
      }));
    } finally {
      pending.current = false;
      setBusy(false);
      setClock(Date.now());
    }
  }, []);
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      const at = Date.now();
      const refreshAt = view.refresh_at > at ? view.refresh_at : at + 1_000;
      const expiry = view.expires_at > at ? view.expires_at : Infinity;
      timer = window.setTimeout(
        update,
        Math.max(100, Math.min(refreshAt, expiry) - at)
      );
    };
    const update = () => {
      window.clearTimeout(timer);
      const at = Date.now();
      setClock(at);
      // Expiry hides old prices immediately; it never bypasses retry backoff.
      if (at >= view.refresh_at) void refresh();
      schedule();
    };
    const restore = () => {
      setFilters(parseFilters(new URLSearchParams(window.location.search)));
      update();
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", update);
    };
  }, [view, refresh]);
  useEffect(() => () => controller.current?.abort(), []);
  const catalogue =
    clock > 0 && clock >= view.expires_at ? null : view.catalogue;
  const visible = useMemo(
    () => filterModels(catalogue?.data ?? [], filters),
    [catalogue, filters]
  );
  const labs = useMemo(
    () =>
      [
        ...new Map(
          (catalogue?.data ?? []).map((m) => [
            m.gg.card.lab.id,
            m.gg.card.lab.name,
          ])
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [catalogue]
  );
  function change(next: Filters, typing = false) {
    setFilters(next);
    const url = new URL(window.location.href);
    for (const [key, value] of [
      ["q", next.q],
      ["kind", next.kind],
      ["lab", next.lab],
      ["input_modalities", next.input.join(",")],
      ["output_modalities", next.output.join(",")],
    ]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history[typing ? "replaceState" : "pushState"](null, "", url);
  }
  if (!catalogue)
    return (
      <div className="rounded-xl border px-6 py-16 text-center">
        <h2 className="text-lg font-medium">
          Models are temporarily unavailable
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn’t load current models and prices. Please try again shortly.
        </p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {busy ? "Retrying…" : "Try again"}
        </Button>
      </div>
    );
  return (
    <>
      {view.state === "stale" ? (
        <Alert className="mb-6">
          <AlertDescription>
            Showing recently saved models. Current availability and prices could
            not be refreshed.
            <Button
              variant="link"
              size="sm"
              onClick={() => void refresh()}
              disabled={busy}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mb-8 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="absolute left-3 top-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search models"
            placeholder="Search models"
            className="pl-9"
            maxLength={128}
            value={filters.q}
            onChange={(event) =>
              change({ ...filters, q: event.target.value }, true)
            }
          />
        </div>
        <Select
          value={filters.kind || "all"}
          onValueChange={(value) =>
            change({ ...filters, kind: value === "all" ? "" : value })
          }
        >
          <SelectTrigger aria-label="Category" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {kinds.map((kind) => (
              <SelectItem value={kind} key={kind}>
                {kindLabels[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.lab || "all"}
          onValueChange={(value) =>
            change({ ...filters, lab: value === "all" ? "" : value })
          }
        >
          <SelectTrigger aria-label="Model lab" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All labs</SelectItem>
            {labs.map(([id, label]) => (
              <SelectItem value={id} key={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status">
          {visible.length} {visible.length === 1 ? "model" : "models"}
        </p>
        <p className="text-xs text-muted-foreground">
          USD · Usage pricing, before credit-purchase fees
        </p>
      </div>
      {visible.length ? (
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((model) => (
            <ModelCard model={model} key={model.id} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border px-6 py-16 text-center">
          <h2 className="font-medium">No matching models</h2>
          <Button
            className="mt-3"
            variant="link"
            onClick={() =>
              change({ q: "", kind: "", lab: "", input: [], output: [] })
            }
          >
            Clear filters
          </Button>
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground">
        Models available through Grida AI Gateway. Separate Desktop and CLI
        provider-key features may offer other models.{" "}
        <a
          href="https://gateway.grida.ai/llms.txt"
          className="underline underline-offset-4"
        >
          API reference
        </a>
      </p>
    </>
  );
}
