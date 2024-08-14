"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import {
  Cross1Icon,
  CrossCircledIcon,
  DividerHorizontalIcon,
  DragHandleDots2Icon,
  GearIcon,
  ImageIcon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Switch } from "@/components/ui/switch";
import clsx from "clsx";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { fmt_snake_case_to_human_text } from "@/utils/fmt";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Button } from "@/components/ui/button";
import { AdminMediaPicker } from "../mediapicker";
import type { Optgroup, Option } from "@/types";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import { produce, type Draft } from "immer";
import { draftid } from "@/utils/id";

type RowItem =
  | ({ type: "option" } & Option)
  | ({ type: "optgroup" } & Optgroup);
type ItemType = RowItem["type"];

type OptionsEditState = {
  options: Option[];
  optgroups: Optgroup[];
};

type OptionsEditAction =
  | ["set", OptionsEditState]
  | ["add", ItemType]
  | ["add-many-options", values: string[]]
  | ["change", { id: string; data: Omit<RowItem, "index"> }]
  | ["sort", { from: number; to: number }]
  | [
      "remove",
      {
        id: string;
        type: ItemType;
      },
    ];

export function initialOptionsEditState(init: {
  options?: Option[];
  optgroups?: Optgroup[];
}): OptionsEditState {
  const sorted_options = Array.from(init?.options ?? []).sort(
    (a, b) => (a.index || -1) - (b.index || -1)
  );
  const sorted_optgroups = Array.from(init?.optgroups ?? []).sort(
    (a, b) => (a.index || -1) - (b.index || -1)
  );
  const allitems = [
    ...sorted_options.map((_) => ({ type: "option" as const, ..._ })),
    ...sorted_optgroups.map((_) => ({ type: "optgroup" as const, ..._ })),
  ].map((_, i) => ({ ..._, index: i }));
  const indexed_options: Option[] = allitems.filter(
    (_) => _.type === "option"
  ) as Option[];
  const indexed_optgroups: Optgroup[] = allitems.filter(
    (_) => _.type === "optgroup"
  ) as Optgroup[];

  return {
    options: indexed_options,
    optgroups: indexed_optgroups,
  };
}

const maxindex = (items: (Option | Optgroup)[]) =>
  Math.max(
    items.reduce((max, item) => Math.max(max, item.index || 0), 0),
    items.length
  );

function organize(draft: Draft<OptionsEditState>) {
  const allitems: RowItem[] = [
    ...draft.options.map((_) => ({ type: "option" as const, ..._ })),
    ...draft.optgroups.map((_) => ({ type: "optgroup" as const, ..._ })),
  ].sort((a, b) => (a.index || -1) - (b.index || -1));

  let currentOptgroupId: string | null = null;

  allitems.forEach((item, i) => {
    item.index = i;
    if (item.type === "optgroup") {
      currentOptgroupId = item.id;
    } else if (item.type === "option") {
      item.optgroup_id = currentOptgroupId;
    }
  });

  draft.options = allitems.filter((_) => _.type === "option") as Option[];
  draft.optgroups = allitems.filter((_) => _.type === "optgroup") as Optgroup[];
}

export function useOptionsEdit(
  state: OptionsEditState,
  action: OptionsEditAction
) {
  return produce(state, (draft) => {
    const next_index = maxindex([...draft.options, ...draft.optgroups]) + 1;

    const [type, arg] = action;
    switch (type) {
      case "set":
        return arg;
      case "add":
        switch (arg) {
          case "option":
            const next_option: Option = {
              ...next_option_default(undefined, { options: draft.options }),
              index: next_index,
            };
            draft.options.push(next_option);
            break;
          case "optgroup":
            draft.optgroups.push({
              id: draftid(),
              label: "Group",
              index: next_index,
            });
            break;
        }
        organize(draft);
        break;
      case "remove":
        switch (arg.type) {
          case "option":
            draft.options = draft.options.filter((_) => _.id !== arg.id);
            break;
          case "optgroup":
            draft.optgroups = draft.optgroups.filter((_) => _.id !== arg.id);
            break;
        }
        organize(draft);
        break;
      case "change":
        switch (arg.data.type) {
          case "option":
            draft.options = draft.options.map((_option) =>
              _option.id === arg.id
                ? ({
                    ..._option,
                    // fields that can be changed via change action (keep id, index, optgroup_id)
                    label: (arg.data as Partial<Option>).label,
                    value: (arg.data as Partial<Option>).value || _option.value,
                    src: (arg.data as Partial<Option>).src,
                    disabled: (arg.data as Partial<Option>).disabled,
                  } satisfies Option)
                : _option
            );
            break;
          case "optgroup":
            draft.optgroups = draft.optgroups.map((_optgroup) =>
              _optgroup.id === arg.id
                ? {
                    ..._optgroup,
                    // fields that can be changed via change action (keep id, index)
                    label: arg.data.label,
                    disabled: arg.data.disabled,
                  }
                : _optgroup
            );
            break;
        }
        break;
      case "add-many-options":
        draft.options.push(
          ...arg.map((value) =>
            next_option_default(value, { options: draft.options })
          )
        );
        organize(draft);
        break;
      case "sort":
        const allitems: RowItem[] = [
          ...draft.options.map((_) => ({ type: "option" as const, ..._ })),
          ...draft.optgroups.map((_) => ({ type: "optgroup" as const, ..._ })),
        ].sort((a, b) => (a.index || -1) - (b.index || -1));

        const shifted = arrayMove(allitems, arg.from, arg.to).map((_, i) => ({
          ..._,
          index: i,
        }));

        draft.options = shifted.filter((_) => _.type === "option") as Option[];
        draft.optgroups = shifted.filter(
          (_) => _.type === "optgroup"
        ) as Optgroup[];

        organize(draft);
        break;
    }
  });
}

function next_option_default(
  seed: string | undefined,
  { options }: { options: Option[] }
): Option {
  const len = options.length;
  const val = (n: number) =>
    seed && !options.some((_) => _.value === seed)
      ? seed
      : `${seed || "option_"}${n}`;
  const label = (n: number) =>
    seed && !options.some((_) => _.label === seed)
      ? seed
      : `${seed ? seed.charAt(0).toUpperCase() + seed.slice(1) : "Option"} ${n}`;

  let n = len + 1;
  while (options.some((_) => _.value === val(n))) {
    n++;
  }

  return {
    id: draftid(),
    value: val(n),
    label: label(n),
    disabled: false,
  };
}

export function OptionsEdit({
  options,
  optgroups,
  onAdd,
  onAddManyOptions,
  onItemChange,
  onSort,
  onRemove,
  disableNewOption,
}: {
  options?: Option[];
  optgroups?: Optgroup[];
  onAdd: (type: ItemType) => void;
  onAddManyOptions: (values: string[]) => void;
  onItemChange?: (id: string, data: RowItem) => void;
  onSort?: (from: number, to: number) => void;
  onRemove?: (type: ItemType, id: string) => void;
  disableNewOption?: boolean;
}) {
  const id = useId();

  const sensors = useSensors(useSensor(PointerSensor));

  const [mode, setMode] = useState<"simple" | "advanced">("simple");

  const toggleMode = () => {
    setMode(mode === "simple" ? "advanced" : "simple");
  };

  const isAdvancedMode = mode === "advanced";

  // options + optgroups
  const items: RowItem[] = useMemo(
    () =>
      [
        ...(optgroups || []).map((o) => ({ type: "optgroup" as const, ...o })),
        ...(options || []).map((o) => ({ type: "option" as const, ...o })),
      ].sort((a, b) => (a.index || 0) - (b.index || 0)),
    [options, optgroups]
  );

  const sortable_item_ids = items.map((o) => o.id);

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortable_item_ids}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 justify-between">
            <span className="text-xs opacity-50">
              Set the options for the select or radio input. you can set the
              value and label individually in advanced mode.
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={toggleMode}>
                  {isAdvancedMode ? <CrossCircledIcon /> : <GearIcon />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Advance Mode - <br />
                customize label, disabled and group
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-col gap-2">
            {isAdvancedMode && (
              <div className="flex text-xs opacity-80">
                <span className="w-5" />
                <span className="flex-1">value</span>
                <span className="flex-[2]">label</span>
                <span className="min-w-16">disabled</span>
                <span className="w-5" />
              </div>
            )}
            <hr />
            <div className="flex flex-col">
              {items.map((item, index) => {
                switch (item.type) {
                  case "option":
                    return (
                      <OptionEditItem
                        key={item.id}
                        id={item.id}
                        mode={mode}
                        label={item.label || ""}
                        value={item.value}
                        src={item.src}
                        disabled={item.disabled}
                        index={index}
                        indent={item.optgroup_id != null}
                        onRemove={() => {
                          onRemove?.("option", item.id);
                        }}
                        onChange={(option) => {
                          onItemChange?.(item.id, {
                            type: "option",
                            id: item.id,
                            ...option,
                          });
                        }}
                      />
                    );
                  case "optgroup":
                    return (
                      <OptgroupEditItem
                        id={item.id}
                        index={index}
                        mode={mode}
                        label={item.label || ""}
                        onChange={(label) => {
                          onItemChange?.(item.id, {
                            ...item,
                            type: "optgroup",
                            id: item.id,
                            label,
                          });
                        }}
                        onRemove={() => {
                          onRemove?.("optgroup", item.id);
                        }}
                      />
                    );
                }
              })}
            </div>
            <hr />
            {!disableNewOption && (
              <div className="flex gap-2 items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAdd("option")}
                >
                  <PlusIcon className="inline-flex me-2" />
                  Add Option
                </Button>
                {isAdvancedMode && (
                  <>
                    <OptionsBulkAdd onSave={onAddManyOptions} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onAdd("optgroup")}
                    >
                      Add Group
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      onSort?.(active.data.current.index, over.data.current.index);
    }
  }
}

const does_fmt_match = (a: string, b: string) =>
  fmt_snake_case_to_human_text(a).toLowerCase() === b.toLowerCase();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function OptionEditItem({
  id,
  label: _label,
  value: _value,
  src: _src,
  disabled: _disabled,
  index,
  mode,
  onChange,
  onRemove,
  indent,
}: {
  id: string;
  label: string;
  value: string;
  src?: string | null;
  disabled?: boolean | null;
  index: number;
  mode: "simple" | "advanced";
  onChange?: (option: {
    label: string;
    value: string;
    src?: string | null;
    disabled: boolean;
  }) => void;
  onRemove?: () => void;
  indent?: boolean;
}) {
  const [value, setValue] = useState(_value);
  const [label, setLabel] = useState(_label);
  const [disabled, setDisabled] = useState<boolean>(_disabled || false);
  const [fmt_matches, set_fmt_matches] = useState<boolean>(
    does_fmt_match(value, label)
  );
  const [src, setSrc] = useState<string | null | undefined>(_src);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const clearSrc = () => setSrc(null);

  useEffect(() => {
    if (fmt_matches) {
      setLabel(capitalize(fmt_snake_case_to_human_text(value)));
    }
    set_fmt_matches(does_fmt_match(value, label));
  }, [value]);

  useEffect(() => {
    set_fmt_matches(does_fmt_match(value, label));
  }, [label]);

  useEffect(() => {
    onChange?.({ label, value, disabled, src });
  }, [value, label, disabled, src]);

  return (
    <RowItemBase
      id={id}
      index={index}
      type="option"
      indent={indent}
      debug={`index - ${index}`}
    >
      <div className="flex flex-col w-full">
        <div className="flex gap-1 items-center pt-2 w-full">
          <label className="flex-1">
            <Input
              className="block w-full font-mono"
              type="text"
              placeholder="option_value"
              value={value}
              required
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <div
            className={clsx(
              mode === "simple" && "hidden",
              "relative gap-2 flex-[2]"
            )}
          >
            <Input
              className={"block w-full"}
              type="text"
              placeholder="Option Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div>
              <AdminMediaPicker
                open={mediaPickerOpen}
                onOpenChange={setMediaPickerOpen}
                onUseImage={(src) => {
                  setSrc(src);
                  setMediaPickerOpen(false);
                }}
              />
              {!src && (
                <button
                  onClick={() => setMediaPickerOpen(true)}
                  type="button"
                  className="absolute right-0 top-0 bottom-0 p-2 z-10"
                >
                  <ImageIcon />
                </button>
              )}
            </div>
          </div>

          <SlotSwitch className={clsx(mode === "simple" && "hidden")}>
            <Switch checked={disabled} onCheckedChange={setDisabled} />
          </SlotSwitch>

          <button type="button" onClick={onRemove}>
            <TrashIcon />
          </button>
        </div>
        {src && (
          <div
            className={clsx("flex gap-1 mt-2", mode === "simple" && "hidden")}
          >
            <span className="flex-1" />
            <div className="flex-[2]">
              <div className="relative">
                <Button
                  onClick={clearSrc}
                  className="absolute z-10 top-0 right-0 w-6 h-6 p-0 m-1"
                  variant="ghost"
                  type="button"
                >
                  <Cross1Icon />
                </Button>
                <div className="aspect-square bg-neutral-500/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full object-contain rounded-sm overflow-hidden pointer-events-none select-none"
                  />
                </div>
              </div>
            </div>
            <span className="min-w-16" />
            <span className="w-5" />
          </div>
        )}
      </div>
    </RowItemBase>
  );
}

function SlotKnob({ children }: React.PropsWithChildren<{}>) {
  return <div className="min-w-5 w-5">{children}</div>;
}

function SlotSwitch({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("flex items-center justify-center min-w-16", className)}>
      {children}
    </div>
  );
}

function SlotIndent({ className }: { className?: string }) {
  return <div className={cn("h-full border-l mx-2", className)} />;
}

function RowItemBase({
  id,
  index,
  type,
  children,
  indent,
  debug,
}: React.PropsWithChildren<{
  type: "option" | "optgroup";
  id: string;
  index: number;
  indent?: boolean;
  debug?: string;
}>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
    isSorting,
    isOver,
    transition,
  } = useSortable({ id: id, data: { type, index } });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1 : 0,
    transition,
  };

  return (
    <div
      //
      ref={setNodeRef}
      style={style}
      className="flex flex-col"
    >
      {/* {debug && process.env.NODE_ENV === "development" && (
        <div className="text-xs opacity-50">{debug}</div>
      )} */}
      <div className="flex gap-1 items-center">
        <SlotKnob>
          <button
            //
            type="button"
            {...listeners}
            {...attributes}
            ref={setActivatorNodeRef}
          >
            <DragHandleDots2Icon className="opacity-50" />
          </button>
        </SlotKnob>
        {indent && (
          <SlotIndent className={isDragging ? "opacity-50" : "opacity-100"} />
        )}
        {children}
      </div>
    </div>
  );
}

function OptgroupEditItem({
  id,
  index,
  mode,
  label,
  onChange,
  onRemove,
}: {
  id: string;
  index: number;
  mode?: "simple" | "advanced";
  label?: string;
  onChange?: (label: string) => void;
  onRemove?: () => void;
}) {
  const detailed = mode === "advanced";

  return (
    <RowItemBase
      id={id}
      index={index}
      type="optgroup"
      debug={`index - ${index}`}
    >
      <div className="flex gap-1 items-center w-full pt-2">
        {detailed && (
          <label className="flex-1">
            <div
              className={
                "flex items-center h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm cursor-not-allowed opacity-50"
              }
            >
              <DividerHorizontalIcon className="me-2" />
              Group
            </div>
          </label>
        )}
        <label className="flex-[2]">
          <Input
            className="block w-full font-mono"
            type="text"
            placeholder="Group Label"
            value={label}
            onChange={(e) => onChange?.(e.target.value)}
            required
          />
        </label>

        {detailed && (
          <SlotSwitch>
            <Switch />
          </SlotSwitch>
        )}

        <button type="button" onClick={onRemove}>
          <TrashIcon />
        </button>
      </div>
    </RowItemBase>
  );
}

function OptionsBulkAdd({ onSave }: { onSave?: (values: string[]) => void }) {
  const [txt, setTxt] = useState("");

  const values = useMemo(
    () =>
      Array.from(
        new Set(
          txt
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean)
        )
      ),
    [txt]
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Add Multiple
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>Add Multiple Options</DialogHeader>
        <DialogDescription>
          Add multiple options by entering a list of values separated by a new
          line. Duplicate values will be ignored
        </DialogDescription>
        <Textarea
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder={`apple\nbanana\ncherry`}
          className="min-h-96"
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              disabled={values.length === 0}
              onClick={() => {
                onSave?.(values);
                setTxt("");
              }}
            >
              {values.length === 0 ? "Add" : <>Add ({values.length})</>}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
