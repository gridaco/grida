"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@app/ui/components/button";
import { Checkbox } from "@app/ui/components/checkbox";
import { Input } from "@app/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import {
  emptyFilters,
  kindLabel,
  modalityLabel,
  kinds,
  modalities,
  type Filters,
  type PublicModel,
} from "@/lib/gg/public-models/catalogue";

type FilterKey = "kinds" | "labs" | "input" | "output";
type FilterOption = { value: string; label: string };
type FilterGroup = {
  key: FilterKey;
  label: string;
  hint: string;
  options: FilterOption[];
};

function FilterPicker({
  groups,
  filters,
  initialKey,
  onChange,
}: {
  groups: FilterGroup[];
  filters: Filters;
  initialKey?: FilterKey;
  onChange: (next: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(initialKey);
  const [search, setSearch] = useState("");
  const id = useId();
  const group = groups.find((g) => g.key === key);
  const selected = group ? filters[group.key] : [];
  const selectedLabels =
    group?.options
      .filter((option) => selected.includes(option.value))
      .map((option) => option.label) ?? [];
  const summary = selectedLabels.length
    ? `${selectedLabels.slice(0, 2).join(", ")}${selected.length > 2 ? ` +${selected.length - 2}` : ""}`
    : selected.join(", ");
  const matches = (label: string) =>
    label.toLowerCase().includes(search.trim().toLowerCase());
  return (
    <div className="inline-flex h-9 items-center rounded-md border bg-background text-sm">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setSearch("");
          setKey(initialKey);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-full rounded-r-none gap-2 px-3 font-normal"
            aria-label={
              initialKey ? `Edit ${group?.label} filter` : "Add filter"
            }
          >
            {initialKey ? (
              <>
                <span className="text-muted-foreground">{group?.label}</span>
                <span className="max-w-48 truncate">{summary}</span>
                <ChevronDown
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" />
                Add filter
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 overflow-hidden p-0"
          aria-label={group ? `${group.label} filter` : "Add a model filter"}
        >
          {group ? (
            <div className="flex items-center justify-between px-3 pt-2">
              <div className="flex items-center gap-1">
                {!initialKey ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Back to filters"
                    onClick={() => {
                      setKey(undefined);
                      setSearch("");
                    }}
                  >
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                <h3 className="text-sm font-medium">{group.label}</h3>
              </div>
              {selected.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => onChange({ ...filters, [group.key]: [] })}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="p-2">
            <Input
              aria-label={
                group
                  ? `Search ${group.label.toLowerCase()} options`
                  : "Search filter types"
              }
              placeholder={group ? "Search options…" : "Filter by…"}
              value={search}
              maxLength={128}
              className="h-8 border-none bg-muted/50 shadow-none focus-visible:ring-1"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div
            className="max-h-72 overflow-y-auto border-t p-1"
            role="group"
            aria-label={group?.label ?? "Filter types"}
          >
            {group
              ? group.options
                  .filter((option) => matches(option.label))
                  .map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`${id}-${group.key}-${option.value}`}
                      className="flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm hover:bg-accent has-[:focus-visible]:bg-accent"
                    >
                      <Checkbox
                        id={`${id}-${group.key}-${option.value}`}
                        checked={selected.includes(option.value)}
                        onCheckedChange={(checked) =>
                          onChange({
                            ...filters,
                            [group.key]:
                              checked === true
                                ? [
                                    ...new Set([...selected, option.value]),
                                  ].sort()
                                : selected.filter(
                                    (value) => value !== option.value
                                  ),
                          })
                        }
                      />
                      {option.label}
                    </label>
                  ))
              : groups
                  .filter((g) => matches(g.label))
                  .map((g) => (
                    <Button
                      key={g.key}
                      variant="ghost"
                      className="w-full justify-between font-normal"
                      onClick={() => {
                        setKey(g.key);
                        setSearch("");
                      }}
                    >
                      {g.label}
                      <ChevronRight
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Button>
                  ))}
            {(group ? group.options : groups).every(
              (option) => !matches(option.label)
            ) ? (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                No matching options
              </p>
            ) : null}
          </div>
          {group ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {group.hint}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
      {initialKey ? (
        <button
          type="button"
          aria-label={`Remove ${group?.label} filter`}
          className="mr-1 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => onChange({ ...filters, [initialKey]: [] })}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function ModelFilters({
  models,
  filters,
  onChange,
}: {
  models: PublicModel[];
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const groups = useMemo<FilterGroup[]>(
    () => [
      {
        key: "kinds",
        label: "Type",
        hint: "Matches any selected type.",
        options: [
          ...new Set([
            ...kinds,
            ...models.map((model) => model.gg.kind).sort(),
          ]),
        ].map((value) => ({ value, label: kindLabel(value) })),
      },
      {
        key: "labs",
        label: "Lab",
        hint: "Matches any selected model creator.",
        options: [
          ...new Map(
            models.map((model) => [
              model.gg.card.lab.id,
              model.gg.card.lab.name,
            ])
          ).entries(),
        ]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        key: "input",
        label: "Input",
        hint: "Supports every selected input type. Exact combinations depend on the operation.",
        options: [
          ...new Set([
            ...modalities,
            ...models.flatMap((model) => model.gg.input_modalities).sort(),
          ]),
        ].map((value) => ({ value, label: modalityLabel(value) })),
      },
      {
        key: "output",
        label: "Output",
        hint: "Matches any selected output type.",
        options: [
          ...new Set([
            ...modalities,
            ...models.flatMap((model) => model.gg.output_modalities).sort(),
          ]),
        ].map((value) => ({ value, label: modalityLabel(value) })),
      },
    ],
    [models]
  );
  const active = groups.filter((group) => filters[group.key].length > 0);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <FilterPicker groups={groups} filters={filters} onChange={onChange} />
      {active.map((group, index) => (
        <div key={group.key} className="flex items-center gap-2">
          {index ? (
            <span className="text-xs text-muted-foreground">and</span>
          ) : null}
          <FilterPicker
            groups={groups}
            filters={filters}
            initialKey={group.key}
            onChange={onChange}
          />
        </div>
      ))}
      {active.length ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => onChange({ ...emptyFilters, q: filters.q })}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
