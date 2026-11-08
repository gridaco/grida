"use client";

import { ArrowUpRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@app/ui/components/table";
import type { PublicModel } from "@/lib/gg/public-models/catalogue";
import {
  displayRate,
  priceConditions,
  type ModelPricing,
} from "@/lib/gg/public-models/pricing";

export function ModelDetails({
  model,
  pricing,
  gatewayOrigin,
}: {
  model: PublicModel;
  pricing: ModelPricing;
  gatewayOrigin: string;
}) {
  const { gg } = model;
  const groups = [...pricing.input, ...pricing.output, ...pricing.additional];
  return (
    <div className="space-y-5">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12">
        <div className="space-y-4">
          <div>
            <a
              href={gg.card.lab.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {gg.card.lab.name}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
            {gg.card.description ? (
              <p className="mt-2 max-w-prose text-sm leading-6">
                {gg.card.description}
              </p>
            ) : null}
          </div>
          <a
            href={
              new URL(
                `/v1/models/${model.id.split("/").map(encodeURIComponent).join("/")}`,
                gatewayOrigin
              ).href
            }
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            API reference
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
          {gg.availability_ends_on ? (
            <p className="text-xs text-muted-foreground">
              Available until {gg.availability_ends_on} (UTC).
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium">Usage pricing</h3>
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="h-8 pl-0 text-xs text-muted-foreground"
                >
                  Charge
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-8 text-right text-xs text-muted-foreground"
                >
                  Rate (USD)
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-8 pl-5 pr-0 text-xs text-muted-foreground"
                >
                  Conditions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.flatMap((group) =>
                group.rates.map((rate, index) => {
                  const conditions = priceConditions(rate).filter(
                    (condition) =>
                      condition !== "Input or operation conditions apply"
                  );
                  const hasPredicate = Object.keys(rate.when).length > 0;
                  return (
                    <TableRow key={rate.id} className="hover:bg-transparent">
                      {index === 0 ? (
                        <TableCell
                          rowSpan={group.rates.length}
                          className="py-3 pl-0 align-top font-medium"
                        >
                          {group.label}
                        </TableCell>
                      ) : null}
                      <TableCell className="py-3 text-right align-top font-mono tabular-nums">
                        {displayRate(rate)}
                      </TableCell>
                      <TableCell className="min-w-44 py-3 pl-5 pr-0 align-top whitespace-normal text-muted-foreground">
                        <div className="space-y-1">
                          {conditions.map((condition) => (
                            <p key={condition}>{condition}</p>
                          ))}
                          {hasPredicate || rate.description ? (
                            <details>
                              <summary className="cursor-pointer hover:text-foreground">
                                {hasPredicate
                                  ? "Applies when"
                                  : "Charge details"}
                              </summary>
                              {rate.description ? (
                                <p className="mt-2 max-w-sm leading-5">
                                  {rate.description}
                                </p>
                              ) : null}
                              <p className="mt-1 font-mono text-[11px]">
                                Meter: {rate.meter}
                              </p>
                              {hasPredicate ? (
                                <pre className="mt-2 max-w-sm overflow-x-auto rounded-md border bg-background p-3 text-[11px] whitespace-pre-wrap break-all">
                                  {JSON.stringify(rate.when, null, 2)}
                                </pre>
                              ) : null}
                            </details>
                          ) : !conditions.length ? (
                            <span>All usage</span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Unit rates. Applicable charges combine.
          </p>
          {gg.pricing_context === "operation_input" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Rates are selected by operation and input.
            </p>
          ) : null}
        </div>
      </div>

      <details className="border-t pt-3 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer hover:text-foreground">
          Technical details
        </summary>
        <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12">
          <div>
            <p className="font-medium text-foreground">Metering</p>
            <p className="mt-1 max-w-prose leading-5">
              {gg.pricing.measurement}
            </p>
          </div>
          {gg.operation_ids.length ? (
            <div className="min-w-0">
              <p className="font-medium text-foreground">Operations</p>
              <ul className="mt-2 space-y-2">
                {gg.operation_ids.map((id) => (
                  <li key={id}>
                    <a
                      href={
                        new URL(
                          `/v1/endpoints/${encodeURIComponent(id)}`,
                          gatewayOrigin
                        ).href
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 hover:text-foreground"
                    >
                      <code className="break-all">{id}</code>
                      <ArrowUpRight
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
