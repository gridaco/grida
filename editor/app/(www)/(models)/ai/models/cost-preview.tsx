"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@app/ui/components/table";
import type { PublicIllustrativeCost } from "@/lib/gg/public-models/catalogue";
import { formatIllustrativeCost } from "@/lib/gg/public-models/pricing";
export function MediaCostHelp() {
  const [open, setOpen] = useState(false);
  const helpId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearClose = useCallback(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  useEffect(() => clearClose, [clearClose]);
  const show = () => {
    clearClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      const active = document.activeElement;
      if (
        trigger.current?.contains(active) ||
        content.current?.contains(active)
      )
        return;
      setOpen(false);
    }, 120);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearClose();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label="About media cost estimates"
          aria-describedby={open ? helpId : undefined}
          onFocus={show}
          onBlur={scheduleClose}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") show();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") scheduleClose();
          }}
          onClick={(event) => {
            event.preventDefault();
            show();
          }}
          className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <CircleHelp className="size-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        id={helpId}
        aria-label="About media cost estimates"
        align="start"
        className="max-w-[calc(100vw-2rem)] p-3 text-xs leading-5"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={clearClose}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") scheduleClose();
        }}
      >
        Estimates for the shown configuration. Actual usage may vary.
      </PopoverContent>
    </Popover>
  );
}

export function CostConfigurations({
  examples,
  id,
}: {
  examples: readonly PublicIllustrativeCost[];
  id?: string;
}) {
  return (
    <Table id={id} className="text-xs">
      <caption className="sr-only">
        Estimated media costs by configuration
      </caption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className="h-8 pl-0">
            Configuration
          </TableHead>
          <TableHead scope="col" className="h-8 pr-0 text-right">
            Cost
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {examples.map((example, index) => (
          <TableRow
            key={`${example.operation_id}/${index}`}
            className="hover:bg-transparent"
          >
            <TableCell className="max-w-64 py-2 pl-0 whitespace-normal">
              {example.label ?? example.scenario}
            </TableCell>
            <TableCell className="py-2 pr-0 text-right font-mono tabular-nums">
              {formatIllustrativeCost(example)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CostPreview({
  examples,
  modelLabel,
}: {
  examples: readonly PublicIllustrativeCost[];
  modelLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const configurationsId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearClose = useCallback(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  useEffect(() => clearClose, [clearClose]);
  const show = () => {
    clearClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      const active = document.activeElement;
      if (
        trigger.current?.contains(active) ||
        content.current?.contains(active)
      )
        return;
      setOpen(false);
    }, 120);
  };
  if (!examples[0]) return null;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearClose();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={`${formatIllustrativeCost(examples[0])}${examples.length > 1 ? `, +${examples.length - 1} more` : ""}. Media cost configurations for ${modelLabel}`}
          aria-describedby={open ? configurationsId : undefined}
          onFocus={show}
          onBlur={scheduleClose}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") show();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") scheduleClose();
          }}
          onClick={(event) => {
            event.preventDefault();
            show();
          }}
          className="rounded-sm text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span className="font-mono tabular-nums underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 hover:decoration-foreground">
            {formatIllustrativeCost(examples[0])}
          </span>
          {examples.length > 1 ? (
            <span className="mt-1 block text-muted-foreground">
              +{examples.length - 1} more
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        aria-label={`Media cost configurations for ${modelLabel}`}
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={clearClose}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") scheduleClose();
        }}
      >
        <CostConfigurations id={configurationsId} examples={examples} />
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Estimates for the shown configuration. Actual usage may vary.
        </p>
      </PopoverContent>
    </Popover>
  );
}
