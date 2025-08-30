import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/components/lib/utils";
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";
import { useValueSeekedSelector } from "@/hooks/use-value-seeked-selector";

export interface ItemRendererProps {
  option: Option;
  selected: boolean;
}

type Option = {
  value: string;
  label: string;
};

interface VirtualizedCommandProps {
  height: string | number;
  options: Option[];
  placeholder: string;
  selectedOption: string;
  onSelectOption?: (option: string) => void;
  renderer?: (props: ItemRendererProps) => React.ReactNode;
  onValueSeeked?: (option: string | null) => void;
}

function DefaultRenderer({
  option,
  selected,
}: {
  option: Option;
  selected: boolean;
}) {
  return (
    <>
      <CheckIcon
        className={cn("size-4 min-w-4", selected ? "opacity-100" : "opacity-0")}
      />
      {option.label}
    </>
  );
}

const VirtualizedCommand = ({
  height,
  options,
  placeholder,
  selectedOption,
  onSelectOption,
  renderer = DefaultRenderer,
  onValueSeeked,
}: VirtualizedCommandProps) => {
  const [search, setSearch] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    const query = search.toLowerCase();
    return query
      ? options.filter((option) =>
          option.value.toLowerCase().includes(query)
        )
      : options;
  }, [options, search]);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const { sync } = useValueSeekedSelector(parentRef, onValueSeeked, "selected");

  const virtualizer = useVirtualizer({
    count: filteredOptions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  });

  const virtualOptions = virtualizer.getVirtualItems();

  React.useLayoutEffect(() => {
    const selectedIndex = filteredOptions.findIndex(
      (option) => option.value === selectedOption
    );
    if (selectedIndex !== -1) {
      virtualizer.scrollToIndex(selectedIndex, { align: "center" });
    }
  }, [selectedOption, filteredOptions, virtualizer]);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  return (
    <Command shouldFilter={false} onKeyDown={sync} onPointerMove={sync}>
      <CommandInput onValueChange={handleSearch} placeholder={placeholder} />
      <CommandEmpty>No item found.</CommandEmpty>
      <CommandGroup
        ref={parentRef}
        style={{
          height: height,
          width: "100%",
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          <CommandList>
            {virtualOptions.map((virtualOption) => (
              <CommandItem
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualOption.size}px`,
                  transform: `translateY(${virtualOption.start}px)`,
                }}
                key={filteredOptions[virtualOption.index].value}
                value={filteredOptions[virtualOption.index].value}
                onSelect={onSelectOption}
              >
                {renderer({
                  option: filteredOptions[virtualOption.index],
                  selected:
                    selectedOption ===
                    filteredOptions[virtualOption.index].value,
                })}
              </CommandItem>
            ))}
          </CommandList>
        </div>
      </CommandGroup>
    </Command>
  );
};

interface VirtualizedComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: string[];
  placeholder?: string;
  width?: string | number;
  height?: string | number;
  sideOffset?: number;
  side?: "left" | "right" | "top" | "bottom";
  align?: "start" | "center" | "end";
  alignOffset?: number;
  renderer?: (props: ItemRendererProps) => React.ReactNode;
  onValueSeeked?: (value: string | null) => void;
  className?: string;
}

export function VirtualizedCombobox({
  value,
  onValueChange,
  options,
  placeholder = "Select",
  height = "400px",
  side,
  sideOffset,
  align,
  alignOffset,
  renderer,
  onValueSeeked,
  className,
}: VirtualizedComboboxProps) {
  const [open, setOpen] = React.useState<boolean>(false);
  const optionItems = React.useMemo(
    () => options.map((option) => ({ value: option, label: option })),
    [options]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn("flex w-full justify-between items-center", className)}
        >
          <span className="line-clamp-1 text-left">
            {value ? options.find((option) => option === value) : placeholder}
          </span>
          <CaretSortIcon className="ml-2 size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
      >
        <VirtualizedCommand
          height={height}
          options={optionItems}
          placeholder={placeholder}
          selectedOption={value ?? ""}
          renderer={renderer}
          onValueSeeked={onValueSeeked}
          onSelectOption={(currentValue) => {
            onValueChange?.(currentValue === value ? "" : currentValue);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
