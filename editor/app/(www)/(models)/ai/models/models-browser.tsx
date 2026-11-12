"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@app/ui/components/table";
import { Alert, AlertDescription } from "@app/ui/components/alert";
import {
  AudioLines,
  Box,
  Braces,
  ChevronDown,
  ImageIcon,
  Search,
  Type,
  Video,
} from "lucide-react";
import {
  filterModels,
  kindLabel,
  modalityLabel,
  emptyFilters,
  serializeFilters,
  parseFilters,
  type Filters,
  type PublicModel,
} from "@/lib/gg/public-models/catalogue";
import { ModelFilters } from "./model-filters";
import { ModelDetails } from "./model-details";
import { LabLogo } from "./lab-logo";
import {
  modelPricing,
  formatIllustrativeAmount,
  type PriceSummaryLine,
} from "@/lib/gg/public-models/pricing";
import type { CatalogueView } from "@/lib/gg/public-models/cache";
import {
  initialTimeAnchor,
  serverTime,
} from "@/lib/gg/public-models/browser-clock";

const releaseFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
function PriceCell({
  lines,
  additional = [],
  model,
  side,
  expanded,
  detailsId,
  onToggle,
}: {
  lines: PriceSummaryLine[];
  additional?: PriceSummaryLine[];
  model: PublicModel;
  side: "Input" | "Output";
  expanded: boolean;
  detailsId: string;
  onToggle: () => void;
}) {
  const primary = lines[0];
  const extra =
    lines.reduce((count, line) => count + line.extraRates, 0) +
    Math.max(0, lines.length - 1);
  const cached = additional.find(
    (line) => line.rates[0].meter === "cached_input_tokens"
  );
  if (!primary && !additional.length)
    return (
      <TableCell className="text-muted-foreground">
        <span
          title={`No separate ${side.toLowerCase()} rate is listed. This does not mean the request is free.`}
        >
          —
        </span>
      </TableCell>
    );
  return (
    <TableCell className="min-w-36">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
        className="rounded-sm text-left text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <span className="sr-only">
          {side} pricing for {model.gg.card.label}:{" "}
        </span>
        {primary ? (
          <span className="block font-mono tabular-nums">{primary.price}</span>
        ) : null}
        {extra ? (
          <span className="mt-1 block text-muted-foreground">
            +{extra} more
          </span>
        ) : primary?.conditional ? (
          <span className="mt-1 block text-muted-foreground">
            Varies by input
          </span>
        ) : null}
        {cached ? (
          <span className="mt-1 block text-muted-foreground">
            Cached: {cached.price}
          </span>
        ) : null}
        {additional.length > (cached ? 1 : 0) ? (
          <span className="mt-1 block text-muted-foreground">
            +{additional.length - (cached ? 1 : 0)} other{" "}
            {additional.length - (cached ? 1 : 0) === 1 ? "rate" : "rates"}
          </span>
        ) : null}
      </button>
    </TableCell>
  );
}

const modalityIcons = {
  text: Type,
  json: Braces,
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  "three-d": Box,
};
function ModalityIcons({
  values,
}: {
  values: PublicModel["gg"]["input_modalities"];
}) {
  return values.map((value) => {
    const label = modalityLabel(value);
    const Icon = Object.hasOwn(modalityIcons, value)
      ? modalityIcons[value as keyof typeof modalityIcons]
      : null;
    return (
      <span key={value} title={label}>
        {Icon ? (
          <Icon className="size-3.5" aria-hidden="true" />
        ) : (
          <span className="text-xs">{label}</span>
        )}
        {Icon ? <span className="sr-only">{label}</span> : null}
      </span>
    );
  });
}

const ModelRow = memo(function ModelRow({
  model,
  gatewayOrigin,
}: {
  model: PublicModel;
  gatewayOrigin: string;
}) {
  const { gg } = model;
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const pricing = modelPricing(model);
  const illustrations = gg.illustrative_costs ?? [];
  const toggle = () => setExpanded((value) => !value);
  return (
    <>
      <TableRow data-state={expanded ? "selected" : undefined}>
        <TableCell className="min-w-72 py-4 pl-5 whitespace-normal">
          <div className="flex items-center gap-3">
            <LabLogo lab={gg.card.lab} />
            <div className="min-w-0">
              <h2 className="text-sm font-medium">{gg.card.label}</h2>
              <code className="mt-0.5 block break-all text-xs text-muted-foreground">
                {model.id}
              </code>
            </div>
          </div>
        </TableCell>
        <TableCell className="min-w-36">
          {illustrations[0] ? (
            <button
              type="button"
              aria-label={`${expanded ? "Hide" : "Show"} estimated cost details for ${gg.card.label}`}
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={toggle}
              className="rounded-sm text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <span className="font-mono tabular-nums underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 hover:decoration-foreground">
                {formatIllustrativeAmount(illustrations[0].amount)}
              </span>
              {illustrations.length > 1 ? (
                <span className="mt-1 block text-muted-foreground">
                  +{illustrations.length - 1} more
                </span>
              ) : null}
            </button>
          ) : (
            <span
              className="text-muted-foreground"
              title="No estimate available."
            >
              —
            </span>
          )}
        </TableCell>
        <PriceCell
          lines={pricing.input}
          additional={pricing.additional}
          model={model}
          side="Input"
          expanded={expanded}
          detailsId={detailsId}
          onToggle={toggle}
        />
        <PriceCell
          lines={pricing.output}
          model={model}
          side="Output"
          expanded={expanded}
          detailsId={detailsId}
          onToggle={toggle}
        />
        <TableCell>
          <Badge variant="secondary" className="font-normal">
            {kindLabel(gg.kind)}
          </Badge>
          <div
            className="mt-2 flex items-center gap-1.5 text-muted-foreground"
            aria-label={`Input: ${gg.input_modalities.map(modalityLabel).join(", ") || "none"}. Output: ${gg.output_modalities.map(modalityLabel).join(", ")}`}
          >
            <ModalityIcons values={gg.input_modalities} />
            <span aria-hidden="true" className="mx-0.5 text-xs">
              →
            </span>
            <ModalityIcons values={gg.output_modalities} />
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {gg.card.release.date ? (
            <a
              href={gg.card.release.source_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
              title={
                gg.card.release.basis === "provider_endpoint"
                  ? "Provider endpoint release; the model may have been released earlier."
                  : gg.card.release.basis === "model"
                    ? "Model release"
                    : `Release basis: ${gg.card.release.basis}`
              }
            >
              <time dateTime={gg.card.release.date}>
                {releaseFormatter.format(
                  new Date(`${gg.card.release.date}T00:00:00Z`)
                )}
              </time>
              {gg.card.release.basis === "provider_endpoint" ? (
                <span className="mt-1 block text-[10px]">Endpoint release</span>
              ) : null}
              {gg.card.release.basis !== "model" &&
              gg.card.release.basis !== "provider_endpoint" ? (
                <span className="mt-1 block text-[10px]">
                  Release basis: {gg.card.release.basis}
                </span>
              ) : null}
            </a>
          ) : (
            <span aria-label="Release date unavailable">—</span>
          )}
        </TableCell>
        <TableCell className="pr-4 text-right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${expanded ? "Hide" : "Show"} details for ${gg.card.label}`}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
            />
          </Button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow id={detailsId} className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={7} className="py-5 pl-16 pr-5 whitespace-normal">
            <ModelDetails
              model={model}
              pricing={pricing}
              gatewayOrigin={gatewayOrigin}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
});

export function ModelsBrowser({
  initial,
  initialFilters,
  gatewayOrigin,
}: {
  initial: CatalogueView;
  initialFilters: Filters;
  gatewayOrigin: string;
}) {
  const [view, setView] = useState(initial);
  const [filters, setFilters] = useState(initialFilters);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(initial.served_at);
  const timeAnchor = useRef({
    server: initial.served_at,
    monotonic: 0,
    wall: 0,
  });
  const serverNow = useCallback(
    () =>
      serverTime(timeAnchor.current, {
        monotonic: performance.now(),
        wall: Date.now(),
      }),
    []
  );
  useEffect(() => {
    const at = performance.now();
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    // Counting from request start is conservative: HTML transit and hydration never
    // restart the server's freshness window. Soft navigation can refresh immediately.
    const started = navigation?.requestStart ?? at;
    timeAnchor.current = initialTimeAnchor(
      initial.served_at,
      {
        monotonic: at,
        wall: Date.now(),
      },
      started
    );
    setView(initial);
    setClock(serverNow());
  }, [initial, serverNow]);
  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    controller.current = new AbortController();
    const started = { monotonic: performance.now(), wall: Date.now() };
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
        (next.state === "fresh" ||
          next.state === "stale" ||
          next.state === "unavailable") &&
        Number.isFinite(next.served_at) &&
        Number.isFinite(next.refresh_at) &&
        Number.isFinite(next.expires_at)
      ) {
        timeAnchor.current = { server: next.served_at, ...started };
        setView(next);
      } else throw new Error("Invalid catalogue view");
    } catch {
      setView((current) => ({
        ...current,
        state: current.catalogue ? "stale" : "unavailable",
        refresh_at: serverNow() + 10_000,
      }));
    } finally {
      pending.current = false;
      setBusy(false);
      setClock(serverNow());
    }
  }, [serverNow]);
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      const at = serverNow();
      const refreshAt = view.refresh_at > at ? view.refresh_at : at + 1_000;
      const expiry = view.expires_at > at ? view.expires_at : Infinity;
      timer = window.setTimeout(
        update,
        Math.max(100, Math.min(refreshAt, expiry) - at)
      );
    };
    const update = () => {
      window.clearTimeout(timer);
      const at = serverNow();
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
  }, [view, refresh, serverNow]);
  useEffect(() => () => controller.current?.abort(), []);
  const catalogue = clock >= view.expires_at ? null : view.catalogue;
  const visible = useMemo(
    () =>
      filterModels(catalogue?.data ?? [], filters).sort(
        (a, b) =>
          (b.gg.card.release.date ?? "").localeCompare(
            a.gg.card.release.date ?? ""
          ) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      ),
    [catalogue, filters]
  );
  function change(next: Filters, typing = false) {
    const query = serializeFilters(next);
    setFilters(parseFilters(query));
    const url = new URL(window.location.href);
    for (const key of [
      "q",
      "kind",
      "lab",
      "input_modalities",
      "output_modalities",
    ]) {
      const value = query.get(key);
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80 sm:shrink-0">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search models"
            placeholder="Search models and labs…"
            className="h-9 pl-9"
            maxLength={128}
            value={filters.q}
            onChange={(event) =>
              change({ ...filters, q: event.target.value }, true)
            }
          />
        </div>
        <ModelFilters
          models={catalogue.data}
          filters={filters}
          onChange={change}
        />
        <p
          className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
          role="status"
        >
          {visible.length} {visible.length === 1 ? "model" : "models"}
        </p>
      </div>
      {visible.length ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <caption className="sr-only">
              Models available through Grida AI Gateway, with capabilities,
              estimated costs and usage pricing.
            </caption>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className="pl-5">
                  Model
                </TableHead>
                <TableHead scope="col">Estimated cost</TableHead>
                <TableHead scope="col">
                  Input{" "}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    USD
                  </span>
                </TableHead>
                <TableHead scope="col">
                  Output{" "}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    USD
                  </span>
                </TableHead>
                <TableHead scope="col">Capabilities</TableHead>
                <TableHead scope="col" aria-sort="descending">
                  Released ↓
                </TableHead>
                <TableHead scope="col" className="w-12">
                  <span className="sr-only">Details</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((model) => (
                <ModelRow
                  model={model}
                  gatewayOrigin={gatewayOrigin}
                  key={model.id}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border px-6 py-16 text-center">
          <h2 className="font-medium">No matching models</h2>
          <Button
            className="mt-3"
            variant="link"
            onClick={() => change(emptyFilters)}
          >
            Clear filters
          </Button>
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground">
        Models available through Grida AI Gateway. Separate Desktop and CLI
        provider-key features may offer other models.{" "}
        <a
          href={new URL("/llms.txt", gatewayOrigin).href}
          className="underline underline-offset-4"
        >
          API reference
        </a>
      </p>
    </>
  );
}
