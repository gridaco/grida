import * as React from "react";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import * as RPNInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/components/lib/utils";

/**
 * ISO 3166-1 alpha-2 region code (e.g. "US", "KR").
 *
 * Note: this is NOT the E.164 country calling code (+1, +82, ...).
 */
export type PhoneCountryCode = RPNInput.Country;

export type PhoneCountryPickerOption = {
  label: string;
  value: PhoneCountryCode;
};

export type PhoneCountryPickerProps = {
  disabled?: boolean;
  value: PhoneCountryCode;
  options: PhoneCountryPickerOption[];
  onChange: (country: PhoneCountryCode) => void;
  className?: string;
};

interface PhoneCountryPickerItemProps extends RPNInput.FlagProps {
  selectedCountry: PhoneCountryCode;
  onChange: (country: PhoneCountryCode) => void;
}

const PhoneCountryPickerItem = ({
  country,
  countryName,
  selectedCountry,
  onChange,
}: PhoneCountryPickerItemProps) => {
  return (
    <CommandItem className="gap-2" onSelect={() => onChange(country)}>
      <FlagComponent country={country} countryName={countryName} />
      <span className="flex-1 text-sm">{countryName}</span>
      <span className="text-sm text-foreground/50">{`+${RPNInput.getCountryCallingCode(country)}`}</span>
      <CheckIcon
        className={`ml-auto size-4 ${country === selectedCountry ? "opacity-100" : "opacity-0"}`}
      />
    </CommandItem>
  );
};

const FlagComponent = ({ country, countryName }: RPNInput.FlagProps) => {
  const Flag = flags[country];

  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-foreground/20 [&_svg]:size-full">
      {Flag && (
        <Flag
          title={countryName}
          // https://github.com/omeralpi/shadcn-phone-input/issues/75#issue-3056082305
          // @ts-expect-error not-typed
          style={{ width: "auto" }}
        />
      )}
    </span>
  );
};

/**
 * Phone country picker (searchable) that selects an ISO-3166-1 alpha-2 region,
 * and displays the derived country calling code (+...).
 */
export function PhoneCountryPicker({
  disabled,
  value: selectedCountry,
  options: countryList,
  onChange,
  className,
}: PhoneCountryPickerProps) {
  const selectedLabel =
    countryList.find((c) => c.value === selectedCountry)?.label ??
    selectedCountry;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-between gap-2 px-3 focus:z-10",
            className
          )}
          disabled={disabled}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FlagComponent
              country={selectedCountry}
              countryName={selectedLabel}
            />
            <span className="line-clamp-1 text-left">{selectedLabel}</span>
            <span className="ml-auto shrink-0 text-sm text-foreground/50">{`+${RPNInput.getCountryCallingCode(
              selectedCountry
            )}`}</span>
          </span>
          <ChevronsUpDown
            className={cn(
              "size-4 shrink-0 opacity-50",
              disabled ? "hidden" : "opacity-100"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <ScrollArea className="h-72">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {countryList.map(({ value, label }) => (
                  <PhoneCountryPickerItem
                    key={value}
                    country={value}
                    countryName={label}
                    selectedCountry={selectedCountry}
                    onChange={onChange}
                  />
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
