import { Button } from "@/components/ui/button";
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
}: VirtualizedCommandProps) => {
  const [filteredOptions, setFilteredOptions] =
    React.useState<Option[]>(options);
  const parentRef = React.useRef(null);

  const virtualizer = useVirtualizer({
    count: filteredOptions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  });

  const virtualOptions = virtualizer.getVirtualItems();

  React.useEffect(() => {
    const selectedIndex = filteredOptions.findIndex(
      (option) => option.value === selectedOption
    );
    if (selectedIndex !== -1) {
      virtualizer.scrollToIndex(selectedIndex, { align: "center" });
    }
  }, [selectedOption, filteredOptions, virtualizer]);

  const handleSearch = (search: string) => {
    setFilteredOptions(
      options.filter((option) =>
        option.value.toLowerCase().includes(search.toLowerCase() ?? [])
      )
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    //   event.preventDefault();
    // }
  };

  return (
    <Command shouldFilter={false} onKeyDown={handleKeyDown}>
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
  className,
}: VirtualizedComboboxProps) {
  const [open, setOpen] = React.useState<boolean>(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <span className="text-ellipsis overflow-hidden">
            {value ? options.find((option) => option === value) : placeholder}
          </span>
          <CaretSortIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
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
          options={options.map((option) => ({ value: option, label: option }))}
          placeholder={placeholder}
          selectedOption={value ?? ""}
          renderer={renderer}
          onSelectOption={(currentValue) => {
            onValueChange?.(currentValue === value ? "" : currentValue);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
