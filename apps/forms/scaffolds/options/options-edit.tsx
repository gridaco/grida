"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import {
  Cross1Icon,
  CrossCircledIcon,
  DragHandleDots2Icon,
  GearIcon,
  ImageIcon,
  LockClosedIcon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Switch } from "@/components/ui/switch";
import clsx from "clsx";
import {
  SortableContext,
  arrayMove,
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
import { MediaPicker } from "../mediapicker";
import type { Option } from "@/types";

export function OptionsEdit({
  options,
  onAdd,
  onChange,
  onSort,
  onRemove,
  disableNewOption,
}: {
  options?: Option[];
  onAdd?: () => void;
  onChange?: (id: string, option: Option) => void;
  onSort?: (from: number, to: number) => void;
  onRemove?: (id: string) => void;
  disableNewOption?: boolean;
}) {
  const id = useId();

  const sensors = useSensors(useSensor(PointerSensor));

  const [mode, setMode] = useState<"simple" | "advanced">("simple");

  const toggleMode = () => {
    setMode(mode === "simple" ? "advanced" : "simple");
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={options?.map((option) => option.id) || []}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 justify-between">
            <span className="text-xs opacity-50">
              Set the options for the select or radio input. you can set the
              value and label individually in advanced mode.
            </span>
            <button type="button" onClick={toggleMode}>
              {mode === "advanced" ? <CrossCircledIcon /> : <GearIcon />}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {mode === "advanced" && (
              <div className="flex text-xs opacity-80">
                <span className="w-5" />
                <span className="flex-1">value</span>
                <span className="flex-[2]">label</span>
                <span className="min-w-16">disabled</span>
                <span className="w-5" />
              </div>
            )}
            <hr />
            {options?.map(({ id, ...option }, index) => (
              <OptionEditItem
                key={id}
                id={id}
                mode={mode}
                label={option.label || ""}
                value={option.value}
                src={option.src}
                disabled={option.disabled}
                index={index}
                onRemove={() => {
                  onRemove?.(id);
                }}
                onChange={(option) => {
                  onChange?.(id, { id, ...option });
                }}
              />
            ))}
            {!disableNewOption && (
              <button
                type="button"
                className="flex gap-2 items-center justify-center border rounded text-xs p-2 w-fit"
                onClick={onAdd}
              >
                <PlusIcon />
                Add Option
              </button>
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
}) {
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
  } = useSortable({ id: id, data: { index } });

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
      className="flex flex-col gap-1"
    >
      <div className="flex gap-1 items-center">
        <button
          //
          type="button"
          {...listeners}
          {...attributes}
          ref={setActivatorNodeRef}
        >
          <DragHandleDots2Icon className="opacity-50" />
        </button>
        <label className="flex-1">
          <input
            className="block w-full p-2 text-gray-900 border border-gray-300 rounded-lg bg-gray-50 text-xs focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
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
          <input
            className={
              "block w-full p-2 text-gray-900 border border-gray-300 rounded-lg bg-gray-50 text-xs focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
            }
            type="text"
            placeholder="Option Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div>
            <MediaPicker
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

        <label
          className={clsx(
            mode === "simple" && "hidden",
            "flex items-center min-w-16"
          )}
        >
          <Switch checked={disabled} onCheckedChange={setDisabled} />
        </label>

        <button type="button" onClick={onRemove}>
          <TrashIcon />
        </button>
      </div>
      <div className={clsx(mode === "simple" && "hidden", "flex gap-1")}>
        <span className="w-5" />
        <span className="flex-1" />
        <div className="flex-[2]">
          {src && (
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
          )}
        </div>
        <span className="min-w-16" />
        <span className="w-5" />
      </div>
    </div>
  );
}
